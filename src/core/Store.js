const _ = require('lodash');
const Parser = require('./Parser');
const DataLoader = require('./DataLoader');
const RedisDriver = require('../driver/RedisDriver');
const MongoDriver = require('../driver/MongoDriver');
const { Neo4jDriver, Neo4jRestDriver } = require('../driver/Neo4jDriver');
const { lcFirst, mergeDeep, isScalarValue, keyPaths } = require('../service/app.service');
const { createSystemEvent } = require('../service/event.service');
const {
  ensureModel,
  ensureModelArrayTypes,
  validateModelData,
  normalizeModelData,
  // normalizeModelDataOut,
  normalizeModelWhere,
  resolveModelWhereClause,
  resolveReferentialIntegrity,
  sortData,
  filterDataByCounts,
} = require('../service/data.service');

module.exports = class Store {
  constructor(parser, schema, stores, driverArgs = {}) {
    this.schema = schema;
    this.parser = parser;

    const availableDrivers = {
      mongo: MongoDriver,
      neo4j: Neo4jDriver,
      neo4jRest: Neo4jRestDriver,
      redis: RedisDriver,
    };

    // Create store instances
    const drivers = Object.entries(stores).reduce((prev, [key, { type, uri, options }]) => {
      return Object.assign(prev, {
        [key]: {
          dao: new availableDrivers[type](uri, schema, options, driverArgs[type]),
          idValue: availableDrivers[type].idValue,
          idField: type === 'mongo' ? '_id' : 'id',
        },
      });
    }, {});

    // Create model store map
    this.storeMap = schema.getModels().reduce((prev, model) => {
      return Object.assign(prev, {
        [model.getName()]: drivers[model.getDriver()],
      });
    }, {});

    // Create model indexes
    schema.getModels().forEach(model => this.storeMap[model.getName()].dao.createIndexes(model.getAlias(), model.getIndexes()));
  }

  toModel(model) {
    if (typeof model === 'string') return this.schema.getModel(model);
    return model;
  }

  get(model, id) {
    model = this.toModel(model);
    const modelName = model.getName();
    const modelAlias = model.getAlias();
    const { loader = this } = this;
    const { dao } = this.storeMap[modelName];

    return createSystemEvent('Query', { method: 'get', model, store: loader, id }, async () => {
      return dao.get(modelAlias, this.idValue(model, id));
    });
  }

  query(modelName, query = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    // const modelName = model.getName();
    // const modelAlias = model.getAlias();
    const { parser, loader = this } = this;
    const { fields, where = {}, sortBy = {}, limit } = query;
    const modelFields = Object.entries(this.parser.getModelFields(model)).filter(([, fieldDef]) => Parser.isScalarField(fieldDef)).map(([k]) => k);
    const selectFields = fields || modelFields.reduce((prev, field) => Object.assign(prev, { [field]: {} }), {});
    const sortFields = keyPaths(sortBy).reduce((prev, path) => {
      if (path.indexOf('count') === 0 || path.indexOf('.count') === 0) return Object.assign(prev, { [path]: _.get(sortBy, path) });
      const $path = path.split('.').map(s => `$${s}`).join('.');
      return Object.assign(prev, { [$path]: _.get(sortBy, path) });
    }, {});
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));

    return createSystemEvent('Query', { method: 'query', model, store: loader, parser, query }, async () => {
      const results = await this.find(model, { ...query, sortBy: {}, limit: 0 });
      const hydratedResults = await this.hydrate(model, results, { fields: selectFields });
      const filteredData = filterDataByCounts(loader, model, hydratedResults, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  find(modelName, query = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser, loader = this } = this;
    const { where = {}, sortBy = {}, limit } = query;
    const { dao } = this.storeMap[model];
    const sortFields = keyPaths(sortBy).reduce((prev, path) => {
      if (path.indexOf('count') === 0 || path.indexOf('.count') === 0) return Object.assign(prev, { [path]: _.get(sortBy, path) });
      const $path = path.split('.').map(s => `$${s}`).join('.');
      return Object.assign(prev, { [$path]: _.get(sortBy, path) });
    }, {});
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: loader, parser, query }, async () => {
      const modelAlias = parser.getModelAlias(model);
      const resolvedWhere = await resolveModelWhereClause(parser, loader, model, where);
      const results = await dao.find(modelAlias, resolvedWhere);
      // normalizeModelDataOut(parser, this, model, results);
      const filteredData = filterDataByCounts(loader, model, results, countFields);
      const sortedResults = sortData(filteredData, sortFields);
      return sortedResults.slice(0, limit > 0 ? limit : undefined);
    });
  }

  count(modelName, where = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser, loader = this } = this;
    const { dao } = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const countPaths = keyPaths(where).filter(p => p.indexOf('count') === 0 || p.indexOf('.count') > 0);
    const countFields = countPaths.reduce((prev, path) => Object.assign(prev, { [path]: _.get(where, path) }), {});
    countPaths.forEach(p => _.unset(where, p));
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'count', model, store: loader, parser, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, loader, model, where);

      if (countPaths.length) {
        const ma = this.schema.getModel(modelAlias);
        const results = await this.query(ma, { where: resolvedWhere, fields: countFields });
        const filteredData = filterDataByCounts(loader, model, results, countFields);
        return filteredData.length;
      }

      return dao.count(modelAlias, resolvedWhere);
    });
  }

  async create(modelName, data) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser, loader = this } = this;
    const { dao } = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: loader, parser, data }, async () => {
      const results = await dao.create(modelAlias, data);
      // normalizeModelDataOut(parser, this, model, results);
      return results;
    });
  }

  async update(modelName, id, data) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser, loader = this } = this;
    const { dao } = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, doc, 'update');

    return createSystemEvent('Mutation', { method: 'update', model, store: loader, parser, id, data }, async () => {
      const merged = normalizeModelData(parser, loader, model, mergeDeep(doc, data));
      const results = await dao.replace(modelAlias, this.idValue(model, id), data, merged);
      // normalizeModelDataOut(parser, this, model, results);
      return results;
    });
  }

  async delete(modelName, id) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser, loader = this } = this;
    const { dao } = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: loader, parser, id }, () => {
      return resolveReferentialIntegrity(parser, loader, model, id).then(() => {
        return dao.delete(modelAlias, this.idValue(model, id), doc);
      });
    });
  }

  dropModel(modelName) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
    const { parser } = this;
    const { dao } = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    return dao.dropModel(modelAlias);
  }

  idValue(model, id) {
    model = this.toModel(model);
    const modelName = model.getName();
    const { idValue } = this.storeMap[modelName];
    return idValue(id);
  }

  idField(model) {
    model = this.toModel(model);
    const modelName = model.getName();
    return this.storeMap[modelName].idField;
  }

  dataLoader() {
    this.loader = new DataLoader(this);
    return this.loader;
  }

  // You may want to move these out of here?
  rollup(modelName, doc, field, w = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
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

  resolve(modelName, doc, field, q = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
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
      if (fieldDef.by) {
        query.where[parser.getModelFieldAlias(dataType[0], fieldDef.by)] = doc.id;
        return loader.find(dataType[0], query);
      }
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

  async hydrate(modelName, results, query = {}) {
    modelName = this.toModel(modelName);
    const model = modelName.getName();
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
        prev[field] = doc[field]; // Retain original values

        // $hydrated values
        const $value = fieldValues[i];
        // const def = this.parser.getModelFieldDef(model, field);
        // if (Array.isArray($value) && def) return Object.assign(prev, { [`$${field}`]: $value.map() });
        return Object.assign(prev, { [`$${field}`]: $value });
      }, countEntries.reduce((prev, [field], i) => {
        return Object.assign(prev, { [field]: countValues[i] });
      }, {
        id: doc.id,
        $id: doc.$id,
      }));
    }));

    return isArray ? data : data[0];
  }
};
