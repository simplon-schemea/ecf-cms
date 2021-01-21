const http = require("http");
const fs = require("fs");
const path = require("path");

const ansi = {
    black: "\u001b[30m",
    red: "\u001b[31m",
    green: "\u001b[32m",
    yellow: "\u001b[33m",
    blue: "\u001b[34m",
    magenta: "\u001b[35m",
    cyan: "\u001b[36m",
    white: "\u001b[37m",
    reset: "\u001b[0m"
};

/**
 * Make a HTTP Request
 *
 * @param options { {url: string, method: string, body: string, headers?: http.OutgoingHttpHeaders }}
 */
function request(options) {
    return new Promise(function (resolve) {
        const headers = options.headers || {};

        if (!headers["Content-Length"] && options.body) {
            headers["Content-Length"] = options.body.length;
        }

        const req = http.request(options.url, {
            method: options.method,
            headers
        }, function (res) {
            const data = [];

            res.on("data", function (chunk) {
                data.push(chunk);
            });

            res.on("end", function () {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(data).toString()
                });
            });
        });

        if (req.writable) {
            if (options.body) {
                req.write(options.body);
            }

            req.end();
        }
    });
}


/**
 * Add prepend <code>prefix</code> and append <code>suffix</code> to each line in <code>value</code>
 *
 * @param {string} prefix
 * @param {string} value
 * @param {string} [suffix]
 * @returns {string}
 */
function addToLines(prefix, value, suffix) {
    return value.split("\n").map(x => (prefix || "") + x + (suffix || "")).join("\n");
}

/**
 * Interpolate {{ key }} using values from <code>map</code>
 * @param {string} value
 * @param {{}} map
 * @returns {string}
 */
function interpolate(value, map) {
    if (!value) {
        return undefined;
    }

    return value.replace(/{\s*{([^{}]+)}\s*}/g, ($0, key) => map[key]);
}

async function main() {
    const requests = findRequests(path.join(__dirname, "readme.md"))
        .map(parseRequest);

    const interpolationMap = global.store = {};

    let success = 0;
    let failed = 0;

    for (const req of requests) {
        req.url = interpolate(req.url, interpolationMap);

        console.log(`> ${ req.method } ${ req.url }`);
        for (let key in req.headers) {
            key = interpolate(key, interpolationMap);
            req.headers[key] = interpolate(req.headers[key], interpolationMap);
            console.log(`> ${ key }: ${ req.headers[key] }`);
        }

        if (req.body) {
            req.body = interpolate(req.body, interpolationMap);
            console.log(ansi.cyan);
            console.log(addToLines("> ", req.body));
            console.log(ansi.reset);
        }

        const res = await request(req);

        for (const key in res.headers) {
            console.log(`< ${ key }: ${ res.headers[key] }`);
        }

        const json = JSON.parse(res.body);
        if (json) {
            console.log(ansi.cyan);
            console.log(addToLines("< ", JSON.stringify(json, null, 2)));
            console.log(ansi.reset);
        }

        const this_ = {
            status: res.status,
            json
        };

        for (const test of req.tests) {

            const fn = new Function("return" + test);
            const result = fn.apply(this_);

            if (result) {
                success++;
            } else {
                failed++;
            }

            console.log(`${ result ? ansi.green : ansi.red }test: [ ${ test.trim() } ] has ${ result ? "passed" : "failed" }${ ansi.reset }`);
        }

        for (const side of req.sides) {
            const fn = new Function(side);
            fn.apply(this_);
        }

        console.log();
    }

    console.log(`${ failed ? ansi.red : ansi.green }${ success } of ${ failed + success } tests passed${ ansi.reset }`);
}

/**
 * Read provided MD file and extract requests
 * @param {string} filepath
 * @returns {string[]}
 */
function findRequests(filepath) {
    const data = fs.readFileSync(filepath, "utf8");
    const pattern = /```http request\n([\s\S]+?)```/g;
    let match;

    const requests = [];

    while (match = pattern.exec(data)) {
        requests.push(match[1]);
    }
    return requests;
}

/**
 * Parse request
 * @param {string} data
 * @returns {{headers: {}, tests: string[], method: string, sides: string[], body: string, url: string}}
 */
function parseRequest(data) {
    const parser = {
        index: 0,
        apply(pattern) {
            const regex = new RegExp(pattern.source, "yg");
            regex.lastIndex = this.index;

            const match = regex.exec(data);

            if (!match) {
                return [];
            }

            const skip = / /gy;
            this.index = skip.lastIndex = regex.lastIndex;
            while (skip.test(data)) this.index = skip.lastIndex;

            return match;
        }
    };

    const patterns = {
        url: /(GET|POST)\s+([^\n]+)\n/,
        headerList: /[^>%]+?\r?\n\r?\n/,
        body: /[^>%]+\n/,
        test: />([^\r\n]+)\n/,
        side: /%([^\r\n]+)\n/
    };

    const headers = {};
    const tests = [];
    const sides = [];

    const [, method, url] = parser.apply(patterns.url);
    const [rawHeaders] = parser.apply(patterns.headerList);
    const [body] = parser.apply(patterns.body);

    {
        const pattern = /([^:]+):([^\n]+)\n/g;
        let tmp;
        while (tmp = pattern.exec(rawHeaders)) {
            const [, key, value] = tmp.map(x => x.trim());
            headers[key] = value;
        }
    }

    for (let tmp; ;) {
        parser.apply(/(\r?\n)+/);

        tmp = parser.apply(patterns.test);
        if (tmp.length > 0) {
            tests.push(tmp[1]);
            continue;
        }

        tmp = parser.apply(patterns.side);
        if (tmp.length > 0) {
            sides.push(tmp[1]);
            continue;
        }

        break;
    }

    return {
        method: method.trim(),
        url: url.trim(),
        headers,
        body: body ? body.trim() : undefined,
        tests,
        sides
    };
}

main().catch(console.error);
