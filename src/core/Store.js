const MongoStore = require('../store/MongoStore');
const { Neo4jDriver, Neo4jRest } = require('../store/Neo4jStore');
const { mergeDeep } = require('../service/app.service');
const { createSystemEvent } = require('../service/event.service');
const { ensureModel, normalizeModelData, resolveModelWhereClause } = require('../service/data.service');

module.exports = class Store {
  constructor(parser, stores) {
    this.parser = parser;

    const availableStores = { mongo: MongoStore, neo4j: Neo4jDriver, neo4jRest: Neo4jRest };

    // Create store instances
    const storesInstances = Object.entries(stores).reduce((prev, [key, { type, uri, options }]) => {
      return Object.assign(prev, {
        [key]: {
          dao: new availableStores[type](uri, options),
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
    const store = this.storeMap[model];
    const modelAlias = this.parser.getModelAlias(model);
    return store.dao.get(modelAlias, store.idValue(id));
  }

  find(model, where = {}) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    return store.dao.find(modelAlias, where);
  }

  async search(model, where = {}) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const resolvedWhere = await resolveModelWhereClause(parser, this, model, where);
    return store.dao.find(modelAlias, resolvedWhere);
  }

  async count(model, where = {}) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const resolvedWhere = await resolveModelWhereClause(parser, this, model, where);
    return store.dao.count(modelAlias, resolvedWhere);
  }

  create(model, data) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);

    return createSystemEvent('Mutation', { method: 'create', model, store: this, parser, data }, () => {
      return store.dao.create(modelAlias, data);
    });
  }

  async update(model, id, data) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'update', model, store: this, parser, id, data }, async () => {
      const merged = mergeDeep(doc, data);
      normalizeModelData(parser, this, model, merged);
      return store.dao.replace(modelAlias, store.idValue(id), data, merged);
    });
  }

  async delete(model, id) {
    const { parser } = this;
    const store = this.storeMap[model];
    const modelAlias = parser.getModelAlias(model);
    const doc = await ensureModel(this, model, id);

    return createSystemEvent('Mutation', { method: 'delete', model, store: this, parser, id, doc }, () => {
      return store.dao.delete(modelAlias, store.idValue(id), doc);
    });
  }

  idValue(model, id) {
    const store = this.storeMap[model];
    return store.idValue(id);
  }

  idField(model) {
    return this.storeMap[model].idField;
  }
};
