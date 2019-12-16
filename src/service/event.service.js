const EventEmitter = require('../core/EventEmitter');
const { validateModelData, normalizeModelData } = require('./data.service');
const { ucFirst } = require('./app.service');

// Event emitters
const internalEvent = new EventEmitter();
const externalEvent = new EventEmitter();
const systemEvent = new EventEmitter().on('system', async (event, next) => {
  const { type, data } = event;
  await internalEvent.emit(type, data);
  await externalEvent.emit(type, data);
  next();
});

// Validate model
internalEvent.on('preMutation', async (event, next) => {
  const { method, model, store, parser, data } = event;

  switch (method) {
    case 'create': case 'update': {
      await validateModelData(parser, store, model, data);
      await normalizeModelData(parser, store, model, data);
      next();
      break;
    }
    case 'delete': {
      console.log('onDelete Ref Integrity');
      next();
      break;
    }
    default: {
      next();
    }
  }
});

//
exports.internalEvent = internalEvent;
exports.externalEvent = externalEvent;
exports.createSystemEvent = (name, event = {}, thunk = () => {}) => {
  const type = ucFirst(name);

  return systemEvent.emit('system', { type: `pre${type}`, data: event }).then(() => thunk()).then((result) => {
    systemEvent.emit('system', { type: `post${type}`, data: result });
    return result;
  });
};