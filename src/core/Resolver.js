const Boom = require('@hapi/boom');
const Parser = require('./Parser');
const MongoStore = require('./MongoStore');
const { isPlainObject, deepMerge, uniq } = require('../service/app.service');

module.exports = class Resolver {
  constructor(parser, stores = {}) {
    this.parser = parser;

    this.stores = Object.entries(stores).reduce((prev, [key, { type, uri }]) => {
      switch (type) {
        case 'mongo': return Object.assign(prev, { [key]: new MongoStore(uri) });
        default: return Object.assign(prev, { [key]: new MongoStore(uri) });
      }
    }, {});
  }

  get(model, id, required = false) {
    return this.stores.default.get(model, id).then((doc) => {
      if (!doc && required) throw Boom.notFound(`${model} Not Found`);
      return doc;
    });
  }

  find(model, filter) {
    return this.stores.default.find(model, filter);
  }

  create(model, data) {
    return this.validate(model, data).then(() => this.stores.default.create(model, this.normalizeModelData(model, data)));
  }

  update(model, id, data) {
    return this.validate(model, data).then(() => this.get(model, id, true).then(doc => this.stores.default.replace(model, id, this.normalizeModelData(model, deepMerge(doc, data)))));
  }

  delete(model, id) {
    return this.get(model, id, true).then(doc => this.stores.default.delete(model, id, doc));
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
            prev[key] = uniq(value).map(v => MongoStore.idValue(v));
          } else {
            prev[key] = value.map(v => MongoStore.idValue(v));
          }
        } else if (field.unique) {
          prev[key] = uniq(value);
        }
      } else if (ref) {
        prev[key] = MongoStore.idValue(value);
      } else {
        prev[key] = value;
      }

      return prev;
    }, {});
  }
};
