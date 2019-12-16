const Boom = require('@hapi/boom');
const Parser = require('../core/Parser');
const { uniq, isPlainObject } = require('../service/app.service');

exports.ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw Boom.notFound(`${model} Not Found`);
    return doc;
  });
};

exports.validateModelData = (parser, store, model, data, path = '') => {
  const promises = [];
  const fields = parser.getModelFields(model);

  Object.entries(data).forEach(([key, value]) => {
    const field = fields[key];
    const ref = Parser.getFieldDataRef(field);
    const fullPath = `${model}.${key}`;

    // Required
    if (field.required && value === null) throw Boom.badRequest(`${fullPath} cannot be null`);

    // Recursive
    if (isPlainObject(value) && ref) {
      promises.push(exports.validateModelData(parser, store, ref, value));
    } else if (Array.isArray(value)) {
      if (ref) {
        if (field.embedded) {
          promises.push(...value.map(v => exports.validateModelData(parser, store, ref, v)));
        } else {
          promises.push(...value.map(v => exports.ensureModel(store, ref, v)));
        }
      } else {
        value.forEach(v => exports.validateModelData(parser, store, key, v));
      }
    } else if (ref) {
      if (field.embedded) {
        promises.push(exports.validateModelData(parser, store, ref, value));
      } else {
        promises.push(exports.ensureModel(store, ref, value));
      }
    } else {
      // Scalar value validation
      if (field.enum && field.enum.indexOf(value) === -1) throw Boom.badRequest(`${fullPath} must be enum: { ${field.enum.join(' ')} }, found '${value}'`);
      if (false) throw Boom.badRequest();
    }
  });

  return Promise.all(promises);
};

exports.normalizeModelData = (parser, store, model, data) => {
  const fields = parser.getModelFields(model);

  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = fields[key];
    const ref = Parser.getFieldDataRef(field);

    if (isPlainObject(value) && ref) {
      prev[key] = exports.normalizeModelData(parser, store, ref, value);
    } else if (Array.isArray(value)) {
      if (ref) {
        if (field.embedded) {
          prev[key] = value.map(v => exports.normalizeModelData(parser, store, ref, v));
        } else if (field.unique) {
          prev[key] = uniq(value).map(v => store.idValue(ref, v));
        } else {
          prev[key] = value.map(v => store.idValue(ref, v));
        }
      } else if (field.unique) {
        prev[key] = uniq(value);
      }
    } else if (ref) {
      prev[key] = store.idValue(ref, value);
    } else {
      prev[key] = value;
    }

    return prev;
  }, data);
};
