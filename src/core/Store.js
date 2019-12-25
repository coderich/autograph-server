const DataLoader = require('./DataLoader');
const RedisStore = require('../store/RedisStore');
const MongoStore = require('../store/MongoStore');
const { Neo4jDriver, Neo4jRest } = require('../store/Neo4jStore');
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
} = require('../service/data.service');

module.exports = class Store {
  constructor(parser, stores, storeArgs = {}) {
    this.parser = parser;

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

  get(model, id) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = this.parser.getModelAlias(model);

    return createSystemEvent('Query', { method: 'get', model, store: this, parser, id }, async () => {
      return store.dao.get(modelAlias, store.idValue(id));
    });
  }

  async find(model, where = {}, debug) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: this, parser, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, this, model, where, undefined, undefined, undefined, debug);
      return store.dao.find(modelAlias, resolvedWhere, debug);
    });
  }

  async count(model, where = {}) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'count', model, store: this, parser, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, this, model, where);
      return store.dao.count(modelAlias, resolvedWhere);
    });
  }

  async create(model, data) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: this, parser, data }, () => {
      return store.dao.create(modelAlias, data);
    });
  }

  async update(model, id, data) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, doc, 'update');

    return createSystemEvent('Mutation', { method: 'update', model, store: this, parser, id, data }, async () => {
      const merged = normalizeModelData(parser, this, model, mergeDeep(doc, data));
      return store.dao.replace(modelAlias, store.idValue(id), data, merged);
    });
  }

  async delete(model, id) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: this, parser, id }, () => {
      return resolveReferentialIntegrity(parser, this, model, id).then(() => store.dao.delete(modelAlias, store.idValue(id), doc));
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
    return new DataLoader(this);
  }
};
