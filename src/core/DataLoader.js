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

  find(model, where = {}, skipCache) {
    if (skipCache) return this.store.find(model, where);
    return this.loader.load({ op: 'find', model, data: where });
  }

  count(model, where = {}) {
    return this.loader.load({ op: 'count', model, data: where });
  }

  create(model, data) {
    return this.store.create(model, data);
  }

  async update(model, id, data) {
    const value = await this.store.update(model, id, data);
    const key = hashObject({ op: 'get', model, data: id });
    this.loader.clear(key).prime(key, value);
    return value;
  }

  async delete(model, id) {
    const value = await this.store.delete(model, id);
    const key = hashObject({ op: 'get', model, data: id });
    this.loader.clear(key);
    return value;
  }

  clear(model, where = {}) {
    const key = hashObject({ op: 'find', model, data: where });
    this.loader.clear(key);
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
