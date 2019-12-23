const DataLoader = require('dataloader');
const { hashObject } = require('../service/app.service');

module.exports = class {
  constructor(store) {
    this.store = store;

    this.loader = new DataLoader((keys) => {
      return Promise.all(keys.map(({ op, model, data, debug }) => this.store[op](model, data, debug)));
    }, {
      cacheKeyFn: key => hashObject(key),
    });
  }

  get(model, id) {
    return this.loader.load({ op: 'get', model, data: id });
  }

  find(model, where = {}, debug) {
    return this.loader.load({ op: 'find', model, data: where, debug });
  }

  count(model, where = {}) {
    return this.loader.load({ op: 'count', model, data: where });
  }

  create(model, data) {
    return this.store.create(model, data);
  }

  update(model, id, data) {
    return this.store.update(model, id, data);
  }

  delete(model, id) {
    return this.store.delete(model, id);
  }

  dropModel(model) {
    return this.store.dropModel(model);
  }

  idValue(model, id) {
    return this.store.idValue(model, id);
  }

  idField(model) {
    return this.store.idField(model);
  }
};
