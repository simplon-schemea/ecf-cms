FROM postgres

ENV POSTGRES_USER postgres
ENV POSTGRES_PASSWORD strapi
ENV POSTGRES_DB strapi

COPY strapi.sql /docker-entrypoint-initdb.d/
