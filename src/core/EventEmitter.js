const EventEmitter = require('events');

/* eslint-disable no-restricted-syntax,no-await-in-loop */
module.exports = class extends EventEmitter {
  async emit(event, data) {
    for (const wrapper of this.rawListeners(event)) {
      await new Promise((resolve, reject) => {
        try {
          const next = () => resolve();
          const numArgs = (wrapper.listener || wrapper).length;
          wrapper(data, next).catch(e => reject(e));
          if (numArgs < 2) resolve();
        } catch (e) {
          resolve();
        }
      });
    }
  }
};
