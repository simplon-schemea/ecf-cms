# ECF: Content Management System

Instructions can be consulted [here](./instructions.pdf)

## Wordpress

Link: [ecfschemea.wordpress.com](https://ecfschemea.wordpress.com/)

## Strapi

### Database

```shell
docker build -t strapi-postgres strapi-postgres
docker run --rm --name strapi-postgres -p 5432:5432 strapi-postgres 
```

### Server

Strapi will connect to `localhost:5432` using 
```
username: postgres
database: strapi
password: strapi
```

Start using

```shell
cd strapi
npm run start
```

### Requests

Those requests can be run using `node http-test.js`

Syntax: 
```
>: test that need to be done
%: side effect to do for the others request
{{varname}}: value to be subtituted by varname
```

#### Unauthenticated requests should return 403 Forbidden

```http request
GET http://localhost:1337/topics

> this.status === 403
> this.json.statusCode === 403
> this.json.error === "Forbidden"
```

#### Authentication should return 200 OK

```http request
POST http://localhost:1337/auth/local
Content-Type: application/json

{
  "identifier": "customer-wannabe@freemium.org",
  "password": "1Wannabe2Wannabe"
}

> this.status === 200 
> typeof this.json.jwt === "string"
> typeof this.json.user === "object"
% store.jwt = this.json.jwt
```

#### Authenticated POST should return 200 OK

```http request
POST http://localhost:1337/topics
Content-Type: application/json
Authorization: Bearer {{jwt}}

{
    "title": "random-subject"
}

> this.status === 200
> typeof this.json.id === "number"
> this.json.title === "random-subject"
% store.topic = this.json.id
```

```http request
POST http://localhost:1337/messages
Content-Type: application/json
Authorization: Bearer {{jwt}}

{
    "topic": "{{topic}}",
    "content": "lorem ipsum"
}

> this.status === 200
> typeof this.json.id === "number"
> this.json.content === "lorem ipsum"
```


#### Authenticated GET should return 200 OK


```http request
GET http://localhost:1337/topics?id={{topic}}
Content-Type: application/json
Authorization: Bearer {{jwt}}

> this.status === 200
> this.json.length === 1
> this.json[0].id === store.topic
```

```http request
GET http://localhost:1337/messages?topic={{topic}}
Content-Type: application/json
Authorization: Bearer {{jwt}}

> this.status === 200
> this.json.length === 1
> this.json[0].topic.id === store.topic
```
