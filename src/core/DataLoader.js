const DataLoader = require('dataloader');
const { hashObject } = require('../service/app.service');

module.exports = class {
  constructor(store) {
    this.store = store;

    this.loader = new DataLoader((keys) => {
      return Promise.all(keys.map(({ op, model, data }) => this.store[op](model, data)));
    }, {
      cacheKeyFn: key => hashObject(key),
    });
  }

  get(model, id) {
    return this.loader.load({ op: 'get', model, data: id });
  }

  find(model, where = {}) {
    return this.loader.load({ op: 'find', model, data: where });
  }

  count(model, where = {}) {
    return this.loader.load({ op: 'count', model, data: where });
  }

  create(model, data) {
    return this.store.create(model, data);
  }

  update(model, id, data, doc) {
    return this.store.replace(model, id, data, doc);
  }

  delete(model, id, doc) {
    return this.store.delete(model, id, doc);
  }

  idValue(model, id) {
    return this.store.idValue(model, id);
  }

  idField(model) {
    return this.store.idField(model);
  }
};
