const EventEmitter = require('../core/EventEmitter');
const { ucFirst } = require('./app.service');

exports.internalEvent = new EventEmitter();
exports.externalEvent = new EventEmitter();

const systemEvent = new EventEmitter().on('system', async (event, next) => {
  const { type, data } = event;
  await exports.internalEvent.emit(type, data);
  await exports.externalEvent.emit(type, data);
  next();
});

exports.createSystemEvent = (name, event, thunk = () => {}) => {
  const type = ucFirst(name);

  return systemEvent.emit('system', { type: `pre${type}`, data: event }).then(() => thunk()).then((result) => {
    systemEvent.emit('system', { type: `post${type}`, data: result });
    return result;
  });
};
