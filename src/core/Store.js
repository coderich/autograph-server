const _ = require('lodash');
const Parser = require('./Parser');
const DataLoader = require('./DataLoader');
const RedisStore = require('../store/RedisStore');
const MongoStore = require('../store/MongoStore');
const { Neo4jDriver, Neo4jRest } = require('../store/Neo4jStore');
const { lcFirst, mergeDeep, isScalarValue, keyPaths } = require('../service/app.service');
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
  constructor(parser, stores, storeArgs = {}) {
    this.parser = parser;
    this.subscriptions = [];

    const availableStores = {
      mongo: MongoStore,
      neo4j: Neo4jDriver,
      neo4jRest: Neo4jRest,
      redis: RedisStore,
    };

    // Create store instances
    const storesInstances = Object.entries(stores).reduce((prev, [key, { type, uri, options }]) => {
      return Object.assign(prev, {
        [key]: {
          dao: new availableStores[type](uri, this.parser, options, storeArgs[type]),
          idValue: availableStores[type].idValue,
          idField: type === 'mongo' ? '_id' : 'id',
        },
      });
    }, {});

    // Create model store map
    this.storeMap = parser.getModelNamesAndStores().reduce((prev, [modelName, storeType]) => {
      return Object.assign(prev, {
        [modelName]: storesInstances[storeType],
      });
    }, {});

    // Create store indexes
    parser.getModelNamesAndIndexes().forEach(([model, indexes]) => this.storeMap[model].dao.createIndexes(this.parser.getModelAlias(model), indexes));
  }

  toObject(model, doc) {
    if (!doc) return undefined;

    // Magic methods
    Object.defineProperty(doc, '$resolve', { value: field => this.resolve(model, doc, field) });
    Object.defineProperty(doc, '$rollup', { value: (field, where) => this.rollup(model, doc, field, where) });
    return doc;
  }

  get(model, id) {
    const { parser, loader = this } = this;
    const store = this.storeMap[model];
    const modelAlias = this.parser.getModelAlias(model);

    return createSystemEvent('Query', { method: 'get', model, store: loader, parser, id }, async () => {
      return store.dao.get(modelAlias, store.idValue(id)).then(doc => this.toObject(model, doc));
    });
  }

  query(model, query = {}) {
    const { parser, loader = this } = this;
    const { where = {}, sortBy = {}, fields = {}, limit } = query;
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));

    return createSystemEvent('Query', { method: 'query', model, store: loader, parser, query }, async () => {
      const results = await this.find(model, { ...query, sortBy: {}, limit: 0 });
      const hydratedResults = await this.hydrate(model, results, { fields });
      const filteredData = filterDataByCounts(loader, model, hydratedResults, countFields);
      const sortedResults = sortData(filteredData, sortBy);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  find(model, query = {}) {
    const { parser, loader = this } = this;
    const { where = {}, sortBy = {}, limit } = query;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: loader, parser, query }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, loader, model, where);
      const results = await store.dao.find(modelAlias, resolvedWhere);
      const filteredData = filterDataByCounts(loader, model, results, countFields);
      const sortedResults = sortData(filteredData, sortBy);
      return sortedResults.slice(0, limit > 0 ? limit : undefined).map(doc => this.toObject(model, doc));
    });
  }

  count(model, where = {}) {
    const { parser, loader = this } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'count', model, store: loader, parser, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, loader, model, where);

      if (countPaths.length) {
        const results = await this.query(modelAlias, { where: resolvedWhere, fields: countFields });
        const filteredData = filterDataByCounts(loader, model, results, countFields);
        return filteredData.length;
      }

      return store.dao.count(modelAlias, resolvedWhere);
    });
  }

  async create(model, data) {
    const { parser, loader = this } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: loader, parser, data }, () => {
      return store.dao.create(modelAlias, data).then(doc => this.toObject(model, doc));
    });
  }

  async update(model, id, data) {
    const { parser, loader = this } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, doc, 'update');

    return createSystemEvent('Mutation', { method: 'update', model, store: loader, parser, id, data }, async () => {
      const merged = normalizeModelData(parser, loader, model, mergeDeep(doc, data));
      return store.dao.replace(modelAlias, store.idValue(id), data, merged).then(res => this.toObject(model, res));
    });
  }

  async delete(model, id) {
    const { parser, loader = this } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: loader, parser, id }, () => {
      return resolveReferentialIntegrity(parser, loader, model, id).then(() => store.dao.delete(modelAlias, store.idValue(id), doc));
    });
  }

  dropModel(model) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    return store.dao.dropModel(modelAlias);
  }

  idValue(model, id) {
    const store = this.storeMap[model];
    return store.idValue(id);
  }

  idField(model) {
    return this.storeMap[model].idField;
  }

  dataLoader() {
    this.loader = new DataLoader(this);
    return this.loader;
  }

  // You may want to move these out of here?
  rollup(model, doc, field, w = {}) {
    const where = _.cloneDeep(w);
    const { parser, loader = this } = this;
    const [, ref, by] = parser.getModelFieldAndDataRef(model, field);

    if (by) {
      where[by] = doc.id;
      return loader.count(ref, where);
    }

    if (!Object.keys(where).length) {
      return (doc[field] || []).length; // Making big assumption that it's an array
    }

    const ids = (doc[field] || []);
    where[loader.idField(ref)] = ids;
    return loader.count(ref, where);
  }

  resolve(model, doc, field, q = {}) {
    const query = _.cloneDeep(q);
    const { parser, loader = this } = this;
    const fieldDef = parser.getModelFieldDef(model, field);
    const dataType = Parser.getFieldDataType(fieldDef);
    const value = doc[parser.getModelFieldAlias(model, field)];
    query.where = query.where || {};

    // Scalar Resolvers
    if (Parser.isScalarField(fieldDef)) return value;

    // Array Resolvers
    if (Array.isArray(dataType)) {
      query.where[parser.getModelFieldAlias(dataType[0], fieldDef.by)] = doc.id;
      if (fieldDef.by) return loader.find(dataType[0], query);
      const valueIds = (value || []).map(v => (isScalarValue(v) ? v : v.id));
      return Promise.all(valueIds.map(id => loader.get(dataType[0], id, fieldDef.required).catch(() => null)));
    }

    // Object Resolvers
    if (fieldDef.by) {
      query.where[parser.getModelFieldAlias(dataType, fieldDef.by)] = doc.id;
      return loader.find(dataType, query).then(results => results[0]);
    }

    const id = isScalarValue(value) ? value : value.id;
    return loader.get(dataType, id, fieldDef.required);
  }

  async hydrate(model, results, query = {}) {
    const { loader = this } = this;
    const { fields = {} } = query;
    const isArray = Array.isArray(results);
    const modelFields = Object.keys(this.parser.getModelFields(model));
    const fieldEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(k) > -1);
    const countEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(lcFirst(k.substr(5))) > -1); // eg. countAuthored
    results = isArray ? results : [results];

    const data = await Promise.all(results.map(async (doc) => {
      // Resolve all values
      const [fieldValues, countValues] = await Promise.all([
        Promise.all(fieldEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.query).map(el => el.query.value); // eslint-disable-line
          const def = this.parser.getModelFieldDef(model, field);
          const ref = Parser.getFieldDataRef(def);
          const resolved = await loader.resolve(model, doc, field, { ...query, ...arg });
          if (Object.keys(subFields).length && ref) return this.hydrate(ref, resolved, { ...query, ...arg, fields: subFields });
          return resolved;
        })),
        Promise.all(countEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.where).map(el => el.where.value); // eslint-disable-line
          return loader.rollup(model, doc, lcFirst(field.substr(5)), arg);
        })),
      ]);

      return fieldEntries.reduce((prev, [field], i) => {
        return Object.assign(prev, { [field]: fieldValues[i] });
      }, countEntries.reduce((prev, [field], i) => {
        return Object.assign(prev, { [field]: countValues[i] });
      }, {
        id: doc.id,
      }));
    }));

    return isArray ? data : data[0];
  }
};
