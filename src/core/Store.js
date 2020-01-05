const Query = require('../query/Query');
const DataLoader = require('./DataLoader');
const { mergeDeep } = require('../service/app.service');
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

  get(model, id, q) {
    model = this.toModel(model);
    const { loader = this } = this;
    const query = new Query(model, q);

    return createSystemEvent('Query', { method: 'get', model, store: loader, id }, async () => {
      const doc = await model.get(id);
      return model.hydrate(loader, doc, { fields: query.getSelectFields() });
    });
  }

  query(model, q) {
    model = this.toModel(model);
    const { loader = this } = this;
    const query = new Query(model, q);
    const [limit, selectFields, countFields, sortFields] = [query.getLimit(), query.getSelectFields(), query.getCountFields(), query.getSortFields()];

    return createSystemEvent('Query', { method: 'query', model, store: loader, query }, async () => {
      const results = await this.find(model, { ...q, sortBy: {}, limit: 0 });
      const hydratedResults = await model.hydrate(loader, results, { fields: selectFields });
      const filteredData = filterDataByCounts(loader, model, hydratedResults, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  find(model, q) {
    model = this.toModel(model);
    const { loader = this } = this;
    const query = new Query(model, q);
    const [where, limit, countFields, sortFields] = [query.getWhere(), query.getLimit(), query.getCountFields(), query.getSortFields()];
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

  count(model, w) {
    model = this.toModel(model);
    const { loader = this } = this;
    const query = new Query(model, { where: w });
    const [where, countFields, countPaths] = [query.getWhere(), query.getCountFields(), query.getCountPaths()];
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
};
