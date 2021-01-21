# ECF: Content Management System

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

##### Unauthenticated requests should receive a 403 status

```http request
GET http://localhost:1337/topics

> this.status === 403
```

#### Authenticate

```http request
POST http://localhost:1337/auth/local
Content-Type: application/json

{
  "identifier": "customer-wannabe@freemium.org",
  "password": "1Wannabe2Wannabe"
}

> this.status === 200 
% store.jwt = this.json.jwt
```

#### Authenticated POST should receive a 200 status

```http request
POST http://localhost:1337/topics
Content-Type: application/json
Authorization: Bearer {{jwt}}

{
    "title": "random-subject"
}

> this.status === 200
% store.topic = this.json.id
```

```http request
POST http://localhost:1337/messages
Content-Type: application/json
Authorization: Bearer {{jwt}}


{
    "topic": "{{topic}}"
}

> this.status === 200
```


#### Authenticated GET should receive a 200 status


```http request
GET http://localhost:1337/topics?id={{topic}}
Content-Type: application/json
Authorization: Bearer {{jwt}}

> this.status === 200
```

```http request
GET http://localhost:1337/messages?topic={{topic}}
Content-Type: application/json
Authorization: Bearer {{jwt}}

> this.status === 200
```
