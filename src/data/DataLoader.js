const DataLoader = require('dataloader');
const { FullQueryBuilder, QueryBuilder } = require('./QueryBuilder');
const QueryFetcher = require('./QueryFetcher');
const Query = require('./Query');
const { hashObject } = require('../service/app.service');

module.exports = class {
  constructor(schema) {
    let fetch;

    this.loader = new DataLoader((keys) => {
      return Promise.all(keys.map(({ method, model, query, args }) => fetch[method](new Query(schema.getModel(model), query), ...args)));
    }, {
      cacheKeyFn: key => hashObject(key),
    });

    fetch = new QueryFetcher(this.loader);
  }

  get(model, id) {
    return new QueryBuilder(this.loader, 'get', model, id);
  }

  query(model) {
    return new FullQueryBuilder(this.loader, 'query', model);
  }

  find(model) {
    return new QueryBuilder(this.loader, 'find', model);
  }

  count(model) {
    return new QueryBuilder(this.loader, 'count', model);
  }

  create(model, data) {
    return new QueryBuilder(this.loader, 'create', model, data);
  }

  update(model, id, data) {
    return new QueryBuilder(this.loader, 'update', model, id, data);
  }

  delete(model, id) {
    return new QueryBuilder(this.loader, 'delete', model, id);
  }

  drop(model) {
    return new QueryBuilder(this.loader, 'drop', model);
  }
};
