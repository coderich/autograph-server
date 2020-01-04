const _ = require('lodash');
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
  normalizeModelWhere,
  resolveModelWhereClause,
  resolveReferentialIntegrity,
  sortData,
  filterDataByCounts,
} = require('../service/data.service');

module.exports = class Store {
  constructor(schema, stores, driverArgs = {}) {
    this.schema = schema;

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
        [model.getName()]: drivers[model.getDriverName()],
      });
    }, {});
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
  rollup(model, doc, fieldName, w = {}) {
    model = this.toModel(model);
    const field = model.getField(fieldName);
    const fieldRef = field.getDataRef();
    const where = _.cloneDeep(w);
    const { loader = this } = this;

    if (field.isVirtual()) {
      where[field.getVirtualRef()] = doc.id;
      return loader.count(fieldRef, where);
    }

    if (!Object.keys(where).length) {
      return (doc[field.getName()] || []).length; // Making big assumption that it's an array
    }

    const ids = (doc[field.getName()] || []);
    where[loader.idField(fieldRef)] = ids;
    return loader.count(fieldRef, where);
  }

  resolve(model, doc, fieldName, q = {}) {
    model = this.toModel(model);
    const field = model.getField(fieldName);
    const query = _.cloneDeep(q);
    const { loader = this } = this;
    const dataType = field.getDataType();
    const value = doc[field.getAlias()];
    query.where = query.where || {};

    // Scalar Resolvers
    if (field.isScalar()) return value;

    // Array Resolvers
    if (Array.isArray(dataType)) {
      if (field.isVirtual()) {
        query.where[field.getVirtualField().getAlias()] = doc.id;
        return loader.find(dataType[0], query);
      }
      const valueIds = (value || []).map(v => (isScalarValue(v) ? v : v.id));
      return Promise.all(valueIds.map(id => loader.get(dataType[0], id, field.isRequired()).catch(() => null)));
    }

    // Object Resolvers
    if (field.isVirtual()) {
      query.where[field.getVirtualField().getAlias()] = doc.id;
      return loader.find(dataType, query).then(results => results[0]);
    }

    const id = isScalarValue(value) ? value : value.id;
    return loader.get(dataType, id, field.isRequired());
  }

  async hydrate(model, results, query = {}) {
    model = this.toModel(model);
    const { loader = this } = this;
    const { fields = {} } = query;
    const isArray = Array.isArray(results);
    const modelFields = model.getFields().map(f => f.getName());
    const fieldEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(k) > -1);
    const countEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(lcFirst(k.substr(5))) > -1); // eg. countAuthored
    results = isArray ? results : [results];

    const data = await Promise.all(results.map(async (doc) => {
      // Resolve all values
      const [fieldValues, countValues] = await Promise.all([
        Promise.all(fieldEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.query).map(el => el.query.value); // eslint-disable-line
          const ref = model.getField(field).getDataRef();
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
