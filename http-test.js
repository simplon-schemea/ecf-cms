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

class Output {
    lf = 0;
    ansi = null;

    /**
     * Insert linefeeds until <code>count</code> is reached
     * linefeeds inserted by previous call of log() or insertLineFeeds() are taken into account
     * @param {number} count - number of desired linefeeds
     */
    insertLineFeeds(count) {
        const diff = count - this.lf;

        if (diff > 0) {
            console.log("\n".repeat(diff - 1));
        }

        this.lf = count;
    }

    /**
     * Keep the provided value until the next log() or end() call as to no generate extra linefeed
     * @param {string} code - intended to be use with ansi escape code, but will work with any string
     */
    format(code) {
        this.ansi = code;
    }

    /**
     * Print to the consoles, add a linefeed at the end
     * @param args - values to be printed, each will be separated by a space
     */
    log(...args) {
        let values = args;

        if (this.ansi) {
            if (values.length > 0) {
                values[0] = this.ansi + values[0];
            } else {
                values = [this.ansi];
            }

            this.ansi = null;
        }

        console.log(...values);

        values = args.map(value => value.toString());

        let lf = 0;

        const lineFeedOnly = !values
            .reverse()
            .some(str => {
                for (let i = str.length - 1; i >= 0; i++) {
                    switch (str.charAt(i)) {
                        case "\n":
                            lf++;
                            break;
                        case "\r":
                            continue;
                        default:
                            return true;
                    }

                    return false;
                }
            });

        this.lf = lineFeedOnly ? this.lf + lf : lf;
    }

    /**
     * Print kept ansi code if it was not printed yet
     */
    flush() {
        if (this.ansi) {
            this.log(this.ansi);
            this.ansi = null;
        }
    }
}

/**
 * Make a HTTP Request
 * @param options { {url: string, method: string, body: string, headers?: http.OutgoingHttpHeaders }}
 */
function request(options) {
    return new Promise(function (resolve, reject) {
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

        req.on("error", reject);

        if (req.writable) {
            if (options.body) {
                req.write(options.body);
            }

            req.end();
        }
    });
}


/**
 * Prepend <code>prefix</code> and append <code>suffix</code> to each line in <code>value</code>
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

async function main() {
    const requests = findRequests(path.join(__dirname, "readme.md"))
        .map(parseRequest);

    const interpolationMap = global.store = {};
    const out = new Output();

    let success = 0;

    for (const req of requests) {
        try {
            req.url = interpolate(req.url, interpolationMap);

            out.log(`> ${ req.method } ${ req.url }`);

            for (let key in req.headers) {
                key = interpolate(key, interpolationMap);
                req.headers[key] = interpolate(req.headers[key], interpolationMap);
                out.log(`> ${ key }: ${ req.headers[key] }`);
            }

            out.insertLineFeeds(1);

            if (req.body) {
                req.body = interpolate(req.body, interpolationMap);
                out.format(ansi.cyan);
                out.log(addToLines("> ", req.body));
                out.format(ansi.reset);
            }

            out.insertLineFeeds(1);

            const res = await request(req);

            for (const key in res.headers) {
                if (res.headers.hasOwnProperty(key)) {
                    out.log(`< ${ key }: ${ res.headers[key] }`);
                }
            }

            out.insertLineFeeds(1);

            let json;

            out.format(ansi.cyan);

            if (res.headers["content-type"].includes("json")) {
                json = JSON.parse(res.body);
                out.log(addToLines("< ", JSON.stringify(json, null, 2)));
            } else {
                out.log(addToLines("< ", res.body));
            }

            out.format(ansi.reset);
            out.insertLineFeeds(1);

            const this_ = {
                status: res.status,
                json,
                body: res.body
            };

            const testResult = req.tests.map(function (test) {
                const fn = new Function("return" + test);
                const result = fn.apply(this_);


                out.log(`test: ${ result ? ansi.green : ansi.red }[ ${ test.trim() } ]${ ansi.reset } has ${ result ? "passed" : "failed" }`);

                return result;
            }).some(success => !success);

            if (!testResult) {
                success++;
            }

            for (const side of req.sides) {
                const fn = new Function(side);
                fn.apply(this_);
            }

            out.insertLineFeeds(2);

        } catch (e) {
            out.insertLineFeeds(2);
            out.flush();
            console.error(`${ ansi.red }an exception occurred during the test`);
            console.error(e, ansi.reset);
            out.lf = 0;
        }
    }

    const haveFailures = success !== requests.length;

    out.insertLineFeeds(2);
    out.log(`${ haveFailures ? ansi.red : ansi.green }${ success } of ${ requests.length } tests passed${ ansi.reset }`);
    out.flush();
}

main().catch(console.error);
