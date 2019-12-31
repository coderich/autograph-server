const DataLoader = require('dataloader');
const { hashObject } = require('../service/app.service');

module.exports = class {
  constructor(store) {
    this.store = store;

    this.loader = new DataLoader((keys) => {
      return Promise.all(keys.map(({ op, model, args }) => this.store[op](model, ...args)));
    }, {
      cacheKeyFn: key => hashObject(key),
    });
  }

  get(model, id) {
    return this.loader.load({ op: 'get', model, args: [id] });
  }

  query(model, query = {}) {
    return this.loader.load({ op: 'query', model, args: [query] });
  }

  find(model, query = {}) {
    return this.loader.load({ op: 'find', model, args: [query] });
  }

  count(model, where = {}) {
    return this.loader.load({ op: 'count', model, args: [where] });
  }

  rollup(model, doc, field, where = {}) {
    return this.loader.load({ op: 'rollup', model, args: [doc, field, where] });
  }

  resolve(model, doc, field, query = {}) {
    return this.loader.load({ op: 'resolve', model, args: [doc, field, query] });
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

  dataLoader() {
    return this.store.dataLoader();
  }
};
