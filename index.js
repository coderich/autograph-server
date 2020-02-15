const { Schema, Resolver } = require('@coderich/autograph');
const { createGraphSchema } = require('./src/service/schema.service');

module.exports = {
  Schema,
  Resolver,
  createGraphSchema,
};
