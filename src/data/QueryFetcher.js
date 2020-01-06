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
  paginateResults,
} = require('../service/data.service');

module.exports = class QueryFetcher {
  constructor(loader) {
    this.loader = loader;
  }

  get(query, id) {
    const { loader } = this;
    const model = query.getModel();

    return createSystemEvent('Query', { method: 'get', model, store: loader, id }, async () => {
      const doc = await model.get(id);
      return model.hydrate(loader, doc, { fields: query.getSelectFields() });
    });
  }

  query(query) {
    const { loader } = this;
    const model = query.getModel();
    const [limit, fields, countFields, sortFields, pagination] = [query.getLimit(), query.getSelectFields(), query.getCountFields(), query.getSortFields(), query.getPagination()];

    return createSystemEvent('Query', { method: 'query', model, store: loader, query }, async () => {
      const results = await loader.find(model, { ...query.toObject(), fields, sortBy: {}, limit: 0, pagination: {} });
      const filteredData = filterDataByCounts(loader, model, results, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      const limitedResults = sortedResults.slice(0, limit > 0 ? limit : undefined);
      return paginateResults(limitedResults, pagination);
    });
  }

  find(query) {
    const { loader } = this;
    const model = query.getModel();
    const [where, limit, selectFields, countFields, sortFields] = [query.getWhere(), query.getLimit(), query.getSelectFields(), query.getCountFields(), query.getSortFields()];
    ensureModelArrayTypes(this, model, where);
    normalizeModelWhere(this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: loader, query }, async () => {
      const resolvedWhere = await resolveModelWhereClause(loader, model, where);
      const results = await model.find(resolvedWhere);
      const hydratedResults = await model.hydrate(loader, results, { fields: selectFields });
      const filteredData = filterDataByCounts(loader, model, hydratedResults, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      const limitedResults = sortedResults.slice(0, limit > 0 ? limit : undefined);
      return paginateResults(limitedResults, query.getPagination());
    });
  }

  count(query) {
    const { loader } = this;
    const model = query.getModel();
    const [where, countFields, countPaths] = [query.getWhere(), query.getCountFields(), query.getCountPaths()];
    ensureModelArrayTypes(this, model, where);
    normalizeModelWhere(this, model, where);

    return createSystemEvent('Query', { method: 'count', model, store: loader, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(loader, model, where);

      if (countPaths.length) {
        const results = await loader.query(model, { where: resolvedWhere, fields: countFields });
        const filteredData = filterDataByCounts(loader, model, results, countFields);
        return filteredData.length;
      }

      return model.count(resolvedWhere);
    });
  }

  async create(query, data) {
    const { loader } = this;
    const model = query.getModel();
    ensureModelArrayTypes(this, model, data);
    normalizeModelData(this, model, data);
    await validateModelData(this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: loader, data }, async () => {
      const doc = await model.create(data);
      return model.hydrate(loader, doc, { fields: query.getSelectFields() });
    });
  }

  async update(query, id, data) {
    const { loader } = this;
    const model = query.getModel();
    const doc = await ensureModel(this, model, id);
    ensureModelArrayTypes(this, model, data);
    normalizeModelData(this, model, data);
    await validateModelData(this, model, data, doc, 'update');

    return createSystemEvent('Mutation', { method: 'update', model, store: loader, id, data }, async () => {
      const merged = normalizeModelData(loader, model, mergeDeep(doc, data));
      const result = await model.update(id, data, merged);
      return model.hydrate(loader, result, { fields: query.getSelectFields() });
    });
  }

  async delete(query, id) {
    const { loader } = this;
    const model = query.getModel();
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: loader, id }, () => {
      return resolveReferentialIntegrity(loader, model, id).then(async () => {
        const result = await model.delete(id, doc);
        return model.hydrate(loader, result, { fields: query.getSelectFields() });
      });
    });
  }
};
