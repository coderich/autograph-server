const Parser = require('./Parser');
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
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = this.parser.getModelAlias(model);

    return createSystemEvent('Query', { method: 'get', model, store: this, parser, id }, async () => {
      return store.dao.get(modelAlias, store.idValue(id)).then(doc => this.toObject(model, doc));
    });
  }

  async find(model, query = {}) {
    const { parser } = this;
    const { where = {}, limit } = query;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, where);
    normalizeModelWhere(parser, this, model, where);

    return createSystemEvent('Query', { method: 'find', model, store: this, parser, where }, async () => {
      const resolvedWhere = await resolveModelWhereClause(parser, this, model, where);
      const results = await store.dao.find(modelAlias, resolvedWhere);
      return results.slice(0, limit > 0 ? limit : undefined).map(doc => this.toObject(model, doc));
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

  rollup(model, doc, field, where = {}) {
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

  resolve(model, doc, field) {
    const { parser, loader = this } = this;
    const fieldDef = parser.getModelFieldDef(model, field);
    const dataType = Parser.getFieldDataType(fieldDef);
    const value = doc[parser.getModelFieldAlias(model, field)];

    // Scalar Resolvers
    if (Parser.isScalarField(fieldDef)) return value;

    // Array Resolvers
    if (Array.isArray(dataType)) {
      if (fieldDef.by) return loader.find(dataType[0], { where: { [parser.getModelFieldAlias(dataType[0], fieldDef.by)]: doc.id } });
      return Promise.all((value || []).map(id => loader.get(dataType[0], id, fieldDef.required).catch(() => null)));
    }

    // Object Resolvers
    if (fieldDef.by) return loader.find(dataType, { where: { [parser.getModelFieldAlias(dataType, fieldDef.by)]: doc.id } }).then(results => results[0]);
    return loader.get(dataType, value, fieldDef.required);
  }

  async create(model, data) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    ensureModelArrayTypes(parser, this, model, data);
    normalizeModelData(parser, this, model, data);
    await validateModelData(parser, this, model, data, {}, 'create');

    return createSystemEvent('Mutation', { method: 'create', model, store: this, parser, data }, () => {
      return store.dao.create(modelAlias, data).then(doc => this.toObject(model, doc));
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
      return store.dao.replace(modelAlias, store.idValue(id), data, merged).then(res => this.toObject(model, res));
    });
  }

  async delete(model, id) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: this, parser, id }, () => {
      return resolveReferentialIntegrity(parser, this, model, id).then(() => store.dao.delete(modelAlias, store.idValue(id), doc).then(res => this.toObject(model, res)));
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
};
