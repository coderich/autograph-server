const Parser = require('./src/core/Parser');
const Store = require('./src/core/Store');
const { eventEmitter: Emitter } = require('./src/service/event.service');
const { createGraphSchema } = require('./src/service/schema.service');

module.exports = {
  Parser,
  Store,
  Emitter,
  createGraphSchema,
};
