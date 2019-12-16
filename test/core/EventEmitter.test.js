const EventEmitter = require('../../src/core/EventEmitter');
const { timeout } = require('../../src/service/app.service');

describe('EventEmitter', () => {
  test('Sanity', (done) => {
    const em = new EventEmitter();

    em.on('hello', async (data, next) => {
      await timeout(1000);
      expect(data).toEqual('world');
      next();
    });

    em.once('hello', (data) => {
      expect(data).toEqual('world');
      done();
    });

    em.emit('hello', 'world');
  });
});
