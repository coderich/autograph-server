const Boom = require('@hapi/boom');
const { get } = require('lodash');
const { ObjectID } = require('mongodb');
const Case = require('change-case');
const Parser = require('../core/Parser');
const { uniq, isScalarValue, isPlainObject, promiseChain } = require('../service/app.service');

exports.ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw Boom.notFound(`${model} Not Found`);
    return doc;
  });
};

exports.validateModelData = (parser, store, model, data, oldData, op) => {
  const promises = [];
  const fields = parser.getModelFields(model);

  Object.entries(fields).forEach(([key, field]) => {
    const value = data[key];
    const oldValue = get(oldData, key);
    const rules = field.rules || [];
    const ref = Parser.getFieldDataRef(field);
    const path = `${model}.${key}`;
    const isValueArray = Array.isArray(value);
    const isTypeArray = Boolean(Parser.getFieldArrayType(field));

    // User-Defined Validation Rules
    if (value == null || isScalarValue(value) || value instanceof ObjectID) {
      rules.forEach(rule => rule(value, oldValue, op, path));
    }

    // The data may not be defined for this key
    if (!Object.prototype.hasOwnProperty.call(data, key)) return;

    // Data type check
    if (isValueArray !== isTypeArray) throw Boom.badRequest(`${path} invalid array`);

    // Recursive/Promises lookup
    if (isValueArray) {
      if (ref) {
        if (field.embedded) {
          promises.push(...value.map((v, i) => exports.validateModelData(parser, store, ref, v, get(oldValue, i), op)));
        } else {
          promises.push(...value.map((v, i) => exports.ensureModel(store, ref, v)));
        }
      } else {
        value.forEach((v, i) => exports.validateModelData(parser, store, key, v, get(oldValue, i), op));
      }
    } else if (ref) {
      if (field.embedded) {
        promises.push(exports.validateModelData(parser, store, ref, value, oldValue, op));
      } else {
        promises.push(exports.ensureModel(store, ref, value));
      }
    }
  });

  return Promise.all(promises);
};

exports.normalizeModelData = (parser, store, model, data) => {
  const fields = parser.getModelFields(model);

  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = fields[key] || {};
    const ref = Parser.getFieldDataRef(field);

    if (value == null) return prev;

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
      switch (Parser.getFieldSimpleType(field)) {
        case 'String': value = `${value}`; break;
        case 'Number': case 'Float': value = Number(value); break;
        case 'Boolean': value = Boolean(value); break;
        default: break;
      }

      switch (field.case) {
        case 'lower': value = value.toLowerCase(); break;
        case 'title': value = Case.capitalCase(value.toLowerCase(), { stripRegexp: new RegExp('[^A-Z0-9\\[\\]?*{}.!]', 'gi') }); break;
        default: break;
      }

      prev[key] = value;
    }

    return prev;
  }, data);
};

exports.resolveModelWhereClause = (parser, store, model, where = {}, fieldAlias = '', lookups2D = [], index = 0) => {
  const fields = parser.getModelFields(model);

  //
  lookups2D[index] = lookups2D[index] || {
    parentFieldAlias: fieldAlias,
    parentModelName: model,
    parentFields: fields,
    parentDataRefs: new Set(parser.getModelDataRefs(model)),
    lookups: [],
  };

  // Depth first traversal to create 2d array of lookups
  lookups2D[index].lookups.push({
    modelName: model,
    query: Object.entries(where).reduce((prev, [key, value]) => {
      const field = fields[key];
      const ref = Parser.getFieldDataRef(field);

      if (ref && isPlainObject(value)) {
        exports.resolveModelWhereClause(parser, store, ref, value, field.alias || key, lookups2D, index + 1);
        return prev;
      }

      return Object.assign(prev, { [key]: value });
    }, {}),
  });

  if (index === 0) {
    if (lookups2D.length === 1) return lookups2D[0].lookups[0].query; // Nothing nested to traverse!

    return promiseChain(lookups2D.reverse().map(({ lookups }, index2D) => {
      return () => Promise.all(lookups.map(async ({ modelName, query }) => {
        const parentLookup = lookups2D[index2D + 1] || { parentDataRefs: new Set() };
        const { parentModelName, parentFields, parentDataRefs } = parentLookup;
        const { parentModelName: currentModelName, parentFields: currentFields, parentFieldAlias: currentFieldAlias } = lookups2D[index2D];

        return store.find(modelName, query).then((results) => {
          if (parentDataRefs.has(modelName)) {
            parentLookup.lookups.forEach((lookup) => {
              // Anything with type `modelName` should be added to query
              Object.entries(parentFields).forEach(([field, fieldDef]) => {
                const ref = Parser.getFieldDataRef(fieldDef);

                if (ref === modelName) {
                  if (fieldDef.by) {
                    Object.assign(lookup.query, {
                      [store.idField(parentModelName)]: results.map(result => store.idValue(parentModelName, result[currentFields[fieldDef.by].alias || fieldDef.by])),
                    });
                  } else {
                    Object.assign(lookup.query, {
                      [currentFieldAlias]: results.map(result => store.idValue(currentModelName, result.id)),
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
      return lookups2D[lookups2D.length - 1].lookups[0].query;
    });
  }

  // Must be a nested call; nothing to do
  return undefined;
};

exports.resolveReferentialIntegrity = async (parser, store, model, id) => {
  const onDeletes = parser.getModelOnDeletes(model);
  const doc = await store.get(model, id);
  console.log(onDeletes);
  return doc;
};
