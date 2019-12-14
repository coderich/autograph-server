const MongoStore = require('../store/MongoStore');
const { Neo4jDriver, Neo4jRest } = require('../store/Neo4jStore');

module.exports = class Store {
  constructor(parser, stores) {
    const availableStores = { mongo: MongoStore, neo4j: Neo4jDriver, neo4jRest: Neo4jRest };

    // Create store instances
    const storesInstances = Object.entries(stores).reduce((prev, [key, { type, uri, options }]) => {
      return Object.assign(prev, {
        [key]: {
          dao: new availableStores[type](uri, options),
          idValue: availableStores[type].idValue,
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
    // parser.getModelNamesAndIndexes().forEach(([model, indexes]) => this.storeMap[model].dao.createIndexes(this.parser.getModelAlias(model), indexes));
  }

  get(model, id) {
    const store = this.storeMap[model];
    return store.dao.get(model, store.idValue(id));
  }

  find(model, where = {}) {
    const store = this.storeMap[model];
    return store.dao.find(model, where);
  }

  create(model, data) {
    const store = this.storeMap[model];
    return store.dao.create(model, data);
  }

  update(model, id, data, doc) {
    const store = this.storeMap[model];
    return store.dao.replace(model, store.idValue(id), data, doc);
  }

  delete(model, id, doc) {
    const store = this.storeMap[model];
    return store.dao.delete(model, store.idValue(id), doc);
  }
};
