const EventEmitter = require('events');

/* eslint-disable no-restricted-syntax,no-await-in-loop */
module.exports = class MyEmitter extends EventEmitter {
  async emit(event, data) {
    for (const wrapper of this.rawListeners(event)) {
      await new Promise((resolve) => {
        const next = () => resolve();
        const numArgs = (wrapper.listener || wrapper).length;
        wrapper(data, next);
        if (numArgs === 1) resolve();
      });
    }
  }
};
