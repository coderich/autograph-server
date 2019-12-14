const Boom = require('@hapi/boom');
const Parser = require('./Parser');
const MongoStore = require('../store/MongoStore');
const { Neo4jDriver, Neo4jRest } = require('../store/CypherStore');
const { isPlainObject, mergeDeep, promiseChain, uniq } = require('../service/app.service');

module.exports = class Resolver {
  constructor(parser, stores = {}) {
    this.parser = parser;

    // Available store types
    this.storeMap = { mongo: MongoStore, neo4j: Neo4jDriver, neo4jRest: Neo4jRest };

    // Create store instances
    this.stores = Object.entries(stores).reduce((prev, [key, { type, uri }]) => Object.assign(prev, { [key]: { conn: new this.storeMap[type](uri), type, uri } }), {});

    // Create store indexes
    parser.getModelNamesAndIndexes().forEach(([model, indexes]) => this.getModelStore(model).conn.createIndexes(this.parser.getModelAlias(model), indexes));
  }

  get(model, id, required = false) {
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    const idValue = this.storeMap[store.type].idValue(id);

    return store.conn.get(modelAlias, idValue).then((doc) => {
      if (!doc && required) throw Boom.notFound(`${model} Not Found`);
      return doc;
    });
  }

  find(model, where = {}) {
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    return store.conn.find(modelAlias, where);
  }

  async search(model, where = {}) {
    const resolvedWhere = await this.resolveModelWhereClause(model, where);
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    return store.conn.find(modelAlias, resolvedWhere);
  }

  create(model, data) {
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    return this.validate(model, data).then(() => store.conn.create(modelAlias, this.normalizeModelData(model, data)));
  }

  update(model, id, data) {
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    const idValue = this.storeMap[store.type].idValue(id);
    return this.validate(model, data).then(() => this.get(model, id, true).then(doc => store.conn.replace(modelAlias, idValue, this.normalizeModelData(model, mergeDeep(doc, data)))));
  }

  delete(model, id) {
    const modelAlias = this.parser.getModelAlias(model);
    const store = this.getModelStore(model);
    return this.get(model, id, true).then(doc => store.conn.delete(modelAlias, id, doc));
  }

  getModelStore(model) {
    return this.stores[this.parser.getModelStore(model)];
  }

  async validate(model, data, path = '') {
    const promises = [];
    const fields = this.parser.getModelFields(model);

    Object.entries(data).forEach(([key, value]) => {
      const field = fields[key];
      const ref = Parser.getFieldDataRef(field);
      const fullPath = `${model}.${key}`;

      // Required
      if (field.required && value === null) throw Boom.badRequest(`${fullPath} cannot be null`);

      // Recursive
      if (isPlainObject(value) && ref) {
        promises.push(this.validate(ref, value));
      } else if (Array.isArray(value)) {
        if (ref) {
          if (field.embedded) {
            promises.push(...value.map(v => this.validate(ref, v)));
          } else {
            promises.push(...value.map(v => this.get(ref, v, true)));
          }
        } else {
          value.forEach(v => this.validate(key, v));
        }
      } else if (ref) {
        if (field.embedded) {
          promises.push(this.validate(ref, value));
        } else {
          promises.push(this.get(ref, value, true));
        }
      } else {
        // Scalar value validation
        if (field.enum && field.enum.indexOf(value) === -1) throw Boom.badRequest(`${fullPath} must be enum: { ${field.enum.join(' ')} }, found '${value}'`);
        if (false) throw Boom.badRequest();
      }
    });

    return Promise.all(promises);
  }

  normalizeModelData(model, data) {
    const fields = this.parser.getModelFields(model);

    return Object.entries(data).reduce((prev, [key, value]) => {
      const field = fields[key];
      const ref = Parser.getFieldDataRef(field);

      if (isPlainObject(value) && ref) {
        prev[key] = this.normalizeModelData(ref, value);
      } else if (Array.isArray(value)) {
        if (ref) {
          if (field.embedded) {
            prev[key] = value.map(v => this.normalizeModelData(ref, v));
          } else if (field.unique) {
            prev[key] = uniq(value).map(v => this.storeMap[this.getModelStore(ref).type].idValue(v));
          } else {
            prev[key] = value.map(v => this.storeMap[this.getModelStore(ref).type].idValue(v));
          }
        } else if (field.unique) {
          prev[key] = uniq(value);
        }
      } else if (ref) {
        prev[key] = this.storeMap[this.getModelStore(ref).type].idValue(value);
      } else {
        prev[key] = value;
      }

      return prev;
    }, {});
  }

  async resolveModelWhereClause(model, where = {}, fieldAlias = '', lookups2D = [], index = 0) {
    const fields = this.parser.getModelFields(model);

    //
    lookups2D[index] = lookups2D[index] || {
      parentFieldAlias: fieldAlias,
      parentModelName: model,
      parentFields: fields,
      parentStore: this.getModelStore(model),
      parentDataRefs: new Set(this.parser.getModelDataRefs(model)),
      lookups: [],
    };

    // Depth first traversal to create 2d array of lookups
    lookups2D[index].lookups.push({
      modelName: model,
      modelAlias: this.parser.getModelAlias(model),
      query: Object.entries(where).reduce((prev, [key, value]) => {
        const field = fields[key];
        const ref = Parser.getFieldDataRef(field);

        if (ref) {
          this.resolveModelWhereClause(ref, value, field.alias || key, lookups2D, index + 1);
          return prev;
        }

        return Object.assign(prev, { [key]: value });
      }, {}),
    });

    if (index === 0) {
      return promiseChain(lookups2D.reverse().map(({ lookups }, index2D) => {
        return () => Promise.all(lookups.map(async ({ modelName, modelAlias, query }) => {
          const parentLookup = lookups2D[index2D + 1] || { parentDataRefs: new Set() };
          const { parentStore, parentFields, parentDataRefs } = parentLookup;
          const { parentStore: currentStore, parentFields: currentFields, parentFieldAlias: currentFieldAlias } = lookups2D[index2D];

          return currentStore.conn.find(modelAlias, query).then((results) => {
            if (parentDataRefs.has(modelName)) {
              parentLookup.lookups.forEach((lookup) => {
                // Anything with type `modelName` should be added to query
                Object.entries(parentFields).forEach(([field, fieldDef]) => {
                  const ref = Parser.getFieldDataRef(fieldDef);
                  const store = this.storeMap[parentStore.type];

                  if (ref === modelName) {
                    if (fieldDef.by) {
                      Object.assign(lookup.query, {
                        _id: results.map(result => store.idValue(result[currentFields[fieldDef.by].alias || fieldDef.by])),
                      });
                    } else {
                      Object.assign(lookup.query, {
                        [currentFieldAlias]: results.map(result => store.idValue(result.id)),
                      });
                    }
                  }
                });
              });
            }

            return results;
          });
        }));
      })).then(() => {
        const lastLookup = lookups2D[lookups2D.length - 1].lookups[0];
        return lastLookup.query;
      });
    }

    // Must be a nested call; nothing to do
    return undefined;
  }
};
