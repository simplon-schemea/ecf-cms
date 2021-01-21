'use strict';
const { sanitizeEntity } = require('strapi-utils');

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {
  async create(ctx) {
    let entity;
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      data.creator = ctx.state.user.id;
      entity = await strapi.services.topics.create(data, { files });
    } else {
      ctx.request.body.creator = ctx.state.user.id;
      entity = await strapi.services.topics.create(ctx.request.body);
    }
    return sanitizeEntity(entity, { model: strapi.models.topics });
  }
};
