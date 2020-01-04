const _ = require('lodash');
const DataLoader = require('./DataLoader');
const { mergeDeep, keyPaths } = require('../service/app.service');
const { createSystemEvent } = require('../service/event.service');
const {
  ensureModel,
  ensureModelArrayTypes,
  validateModelData,
  normalizeModelData,
  normalizeModelWhere,
  resolveModelWhereClause,
  resolveReferentialIntegrity,
  sortData,
  filterDataByCounts,
} = require('../service/data.service');

module.exports = class Store {
  constructor(schema) {
    this.schema = schema;
  }

  toModel(model) {
    if (typeof model === 'string') return this.schema.getModel(model);
    return model;
  }

  get(model, id) {
    model = this.toModel(model);
    const { loader = this } = this;

    return createSystemEvent('Query', { method: 'get', model, store: loader, id }, async () => {
      return model.get(id);
    });
  }

  query(model, query = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    const { fields, where = {}, sortBy = {}, limit } = query;
    const modelFields = model.getScalarFields();
    const selectFields = fields || modelFields.reduce((prev, field) => Object.assign(prev, { [field.getName()]: {} }), {});
    const sortFields = keyPaths(sortBy).reduce((prev, path) => {
      if (path.indexOf('count') === 0 || path.indexOf('.count') === 0) return Object.assign(prev, { [path]: _.get(sortBy, path) });
      const $path = path.split('.').map(s => `$${s}`).join('.');
      return Object.assign(prev, { [$path]: _.get(sortBy, path) });
    }, {});
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));

    return createSystemEvent('Query', { method: 'query', model, store: loader, query }, async () => {
      const results = await this.find(model, { ...query, sortBy: {}, limit: 0 });
      const hydratedResults = await this.hydrate(model, results, { fields: selectFields });
      const filteredData = filterDataByCounts(loader, model, hydratedResults, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  find(model, query = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    const { where = {}, sortBy = {}, limit } = query;
    const sortFields = keyPaths(sortBy).reduce((prev, path) => {
      if (path.indexOf('count') === 0 || path.indexOf('.count') === 0) return Object.assign(prev, { [path]: _.get(sortBy, path) });
      const $path = path.split('.').map(s => `$${s}`).join('.');
      return Object.assign(prev, { [$path]: _.get(sortBy, path) });
    }, {});
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(this, model, where);
    normalizeModelWhere(this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: loader, query }, async () => {
      const resolvedWhere = await resolveModelWhereClause(loader, model, where);
      const results = await model.find(resolvedWhere);
      const filteredData = filterDataByCounts(loader, model, results, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  count(model, where = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(this, model, where);
    normalizeModelWhere(this, model, where);

    return createSystemEvent('Query', { method: 'count', model, store: loader, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(loader, model, where);

      if (countPaths.length) {
        const results = await this.query(model, { where: resolvedWhere, fields: countFields });
        const filteredData = filterDataByCounts(loader, model, results, countFields);
        return filteredData.length;
      }

      return model.count(resolvedWhere);
    });
  }

  async create(model, data) {
    model = this.toModel(model);
    const { loader = this } = this;
    ensureModelArrayTypes(this, model, data);
    normalizeModelData(this, model, data);
    await validateModelData(this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: loader, data }, async () => {
      return model.create(data);
    });
  }

  async update(model, id, data) {
    model = this.toModel(model);
    const { loader = this } = this;
    const doc = await ensureModel(this, model, id);
    ensureModelArrayTypes(this, model, data);
    normalizeModelData(this, model, data);
    await validateModelData(this, model, data, doc, 'update');

    return createSystemEvent('Mutation', { method: 'update', model, store: loader, id, data }, async () => {
      const merged = normalizeModelData(loader, model, mergeDeep(doc, data));
      return model.update(id, data, merged);
    });
  }

  async delete(model, id) {
    model = this.toModel(model);
    const { loader = this } = this;
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: loader, id }, () => {
      return resolveReferentialIntegrity(loader, model, id).then(() => {
        return model.delete(id, doc);
      });
    });
  }

  dropModel(model) {
    model = this.toModel(model);
    return model.drop();
  }

  idValue(model, id) {
    model = this.toModel(model);
    return model.idValue(id);
  }

  idField(model) {
    model = this.toModel(model);
    return model.idField();
  }

  dataLoader() {
    this.loader = new DataLoader(this);
    return this.loader;
  }

  // You may want to move these out of here?
  rollup(model, doc, fieldName, where = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    const field = model.getField(fieldName);
    return field.count(loader, doc, where);
  }

  resolve(model, doc, fieldName, query = {}) {
    model = this.toModel(model);
    const field = model.getField(fieldName);
    const { loader = this } = this;
    return field.resolve(loader, doc, query);
  }

  async hydrate(model, results, query = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    return model.hydrate(loader, results, query);
  }
};
