const Boom = require('@hapi/boom');
const Case = require('change-case');
const Parser = require('../core/Parser');
const { uniq, isPlainObject, promiseChain } = require('../service/app.service');

exports.ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw Boom.notFound(`${model} Not Found`);
    return doc;
  });
};

exports.validateModelData = (parser, store, model, data, path = '') => {
  const promises = [];
  const fields = parser.getModelFields(model);

  Object.entries(fields).forEach(([key, field]) => {
    const value = data[key];
    const ref = Parser.getFieldDataRef(field);
    const fullPath = `${model}.${key}`;

    // Required
    if (field.required && value == null) throw Boom.badRequest(`${fullPath} cannot be set to null`);
    if (!Object.prototype.hasOwnProperty.call(data, field)) return;

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
      if (field) {
        switch (field.case) {
          case 'lower': value = value.toLowerCase(); break;
          case 'title': value = Case.capitalCase(value.toLowerCase()); break;
          default: break;
        }
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

      if (ref) {
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
