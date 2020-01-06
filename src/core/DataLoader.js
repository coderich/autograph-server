const DataLoader = require('dataloader');
const { hashObject } = require('../service/app.service');

module.exports = class {
  constructor(store) {
    this.store = store;

    this.loader = new DataLoader((keys) => {
      return Promise.all(keys.map(({ op, model, args }) => this.store[op](model, ...args)));
    }, {
      cacheKeyFn: key => hashObject({ ...key, model: store.toModel(key.model).getName() }),
    });
  }

  get(model, id, query = {}) {
    return this.loader.load({ op: 'get', model, args: [id, query] });
  }

  async query(model, query = {}) {
    // return this.loader.load({ op: 'query', model, args: [query] });
    const results = await this.loader.load({ op: 'query', model, args: [query] });

    results.forEach((doc) => {
      const getKey = { op: 'get', model, args: [doc.id, {}] };
      // console.log('prime', getKey);
      this.loader.clear(getKey).prime(getKey, doc);
    });

    return results;
  }

  async find(model, query = {}) {
    const results = await this.loader.load({ op: 'find', model, args: [query] });

    results.forEach((doc) => {
      const getKey = { op: 'get', model, args: [doc.id, {}] };
      this.loader.clear(getKey).prime(getKey, doc);
    });

    return results;
  }

  count(model, where = {}) {
    return this.loader.load({ op: 'count', model, args: [where] });
  }

  create(model, data, query) {
    return this.store.create(model, data, query);
  }

  update(model, id, data, query) {
    return this.store.update(model, id, data, query);
  }

  delete(model, id, query) {
    return this.store.delete(model, id, query);
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

  toModel(model) {
    return this.store.toModel(model);
  }

  dataLoader() {
    return this.store.dataLoader();
  }
};
