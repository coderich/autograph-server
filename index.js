const Parser = require('./src/core/Parser');
const Store = require('./src/core/Store');
const Schema = require('./src/schema/Schema');
const { eventEmitter: Emitter } = require('./src/service/event.service');
const { createGraphSchema } = require('./src/service/schema.service');

module.exports = {
  Parser,
  Store,
  Schema,
  Emitter,
  createGraphSchema,
};
