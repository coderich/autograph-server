const Boom = require('@hapi/boom');
const Parser = require('../core/Parser');
const { isPlainObject } = require('../service/app.service');

const ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw Boom.notFound(`${model} Not Found`);
    return doc;
  });
};

exports.validate = (parser, store, model, data, path = '') => {
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
      promises.push(exports.validate(parser, store, ref, value));
    } else if (Array.isArray(value)) {
      if (ref) {
        if (field.embedded) {
          promises.push(...value.map(v => exports.validate(parser, store, ref, v)));
        } else {
          promises.push(...value.map(v => ensureModel(store, ref, v)));
        }
      } else {
        value.forEach(v => exports.validate(parser, store, key, v));
      }
    } else if (ref) {
      if (field.embedded) {
        promises.push(exports.validate(parser, store, ref, value));
      } else {
        promises.push(ensureModel(store, ref, value));
      }
    } else {
      // Scalar value validation
      if (field.enum && field.enum.indexOf(value) === -1) throw Boom.badRequest(`${fullPath} must be enum: { ${field.enum.join(' ')} }, found '${value}'`);
      if (false) throw Boom.badRequest();
    }
  });

  return Promise.all(promises);
};
