const _ = require('lodash');
const { ObjectID } = require('mongodb');
const Parser = require('../core/Parser');
const { NotFoundError, BadRequestError } = require('../service/error.service');
const { uniq, globToRegexp, isScalarValue, isPlainObject, promiseChain, isIdValue, keyPaths } = require('../service/app.service');

exports.ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw new NotFoundError(`${model} Not Found`);
    return doc;
  });
};

exports.validateModelData = (parser, store, model, data, oldData, op) => {
  const promises = [];
  const fields = parser.getModelFields(model);

  Object.entries(fields).forEach(([key, field]) => {
    const value = data[key];
    const rules = field.rules || [];
    const ref = Parser.getFieldDataRef(field);
    const path = `${model}.${key}`;
    const isValueArray = Array.isArray(value);
    const isTypeArray = Boolean(Parser.getFieldArrayType(field));

    // User-Defined Validation Rules
    if (value == null || isScalarValue(value) || value instanceof ObjectID) {
      rules.forEach(rule => rule(value, oldData, op, path));
    }

    // The data may not be defined for this key
    if (!Object.prototype.hasOwnProperty.call(data, key)) return;

    // Data type check
    if (isValueArray !== isTypeArray) throw new BadRequestError(`${path} invalid array`);

    // Recursive/Promises lookup
    if (isValueArray) {
      if (ref) {
        if (field.embedded) {
          promises.push(...value.map(v => exports.validateModelData(parser, store, ref, v, oldData, op)));
        } else {
          promises.push(...value.map(v => exports.ensureModel(store, ref, v)));
          value.forEach(v => rules.forEach(rule => rule(v, oldData, op, path)));
        }
      } else {
        value.forEach(v => rules.forEach(rule => rule(v, oldData, op, path)));
      }
    } else if (ref) {
      if (field.embedded) {
        promises.push(exports.validateModelData(parser, store, ref, value, oldData, op));
      } else {
        promises.push(exports.ensureModel(store, ref, value));
      }
    }
  });

  return Promise.all(promises);
};

exports.ensureModelArrayTypes = (parser, store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = parser.getModelFieldDef(model, key);
    if (value == null || field == null) return prev;

    // Ensure array if type array
    const isArrayType = Boolean(Parser.getFieldArrayType(field));
    if (isArrayType && !Array.isArray(value)) prev[key] = [value];

    return prev;
  }, data);
};

exports.transformFieldValue = (field, value) => {
  const transforms = field.transforms || [];

  switch (Parser.getFieldSimpleType(field)) {
    case 'String': {
      value = `${value}`;
      break;
    }
    case 'Number': case 'Float': {
      const num = Number(value);
      if (!Number.isNaN(num)) value = num;
      break;
    }
    case 'Boolean': {
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      break;
    }
    default: {
      break;
    }
  }

  // Transforming
  transforms.forEach(t => (value = t(value)));

  return value;
};


exports.normalizeModelWhere = (parser, store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = parser.getModelFieldDef(model, key);
    if (value == null || field == null) return prev;

    const ref = Parser.getFieldDataRef(field);

    if (ref) {
      if (isPlainObject(value)) {
        prev[key] = exports.normalizeModelWhere(parser, store, ref, value);
      } else if (Array.isArray(value)) {
        prev[key] = value.map((val) => {
          if (isPlainObject(val)) return exports.normalizeModelWhere(parser, store, ref, val);
          if (isIdValue(val)) return store.idValue(ref, val);
          return val;
        });
      } else {
        prev[key] = store.idValue(ref, value);
      }
    } else if (Array.isArray(value)) {
      prev[key] = value.map(val => exports.transformFieldValue(field, val));
    } else {
      prev[key] = exports.transformFieldValue(field, value);
    }

    return prev;
  }, data);
};

exports.normalizeModelData = (parser, store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = parser.getModelFieldDef(model, key);
    if (value == null || field == null) return prev;

    const ref = Parser.getFieldDataRef(field);
    const type = Parser.getFieldDataType(field);

    if (isPlainObject(value) && ref) {
      prev[key] = exports.normalizeModelData(parser, store, ref, value);
    } else if (Array.isArray(value)) {
      if (ref) {
        if (field.embedded || field.by) {
          prev[key] = value.map(v => exports.normalizeModelData(parser, store, ref, v));
        } else if (type.isSet) {
          prev[key] = uniq(value).map(v => store.idValue(ref, v));
        } else {
          prev[key] = value.map(v => store.idValue(ref, v));
        }
      } else {
        prev[key] = value.map(v => exports.transformFieldValue(field, v));
        if (type.isSet) prev[key] = uniq(prev[key]);
      }
    } else if (ref) {
      prev[key] = store.idValue(ref, value);
    } else {
      prev[key] = exports.transformFieldValue(field, value);
    }

    return prev;
  }, data);
};

exports.normalizeModelDataOut = (parser, store, model, data) => {
  const isArray = Array.isArray(data);
  data = isArray ? data : [data];

  const results = data.map(d => Object.entries(d).reduce((prev, [key, value]) => {
    const field = parser.getModelFieldDef(model, key);
    if (value == null || field == null) return prev;

    const ref = Parser.getFieldDataRef(field);

    if (ref) {
      if (isPlainObject(value)) {
        prev[key] = Object.assign(value, { id: store.idValueOut(ref, value.id) });
      } else if (Array.isArray(value)) {
        if (field.embedded || field.by) {
          prev[key] = value.map(v => exports.normalizeModelDataOut(parser, store, ref, v));
        } else {
          prev[key] = value.map(obj => Object.assign(obj, { id: store.idValueOut(ref, obj.id) }));
        }
      } else {
        prev[key] = store.idValueOut(ref, value);
      }
    }

    return prev;
  }, d));

  return isArray ? results : results[0];
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
        if (isPlainObject(value)) {
          exports.resolveModelWhereClause(parser, store, ref, value, field.alias || key, lookups2D, index + 1);
          return prev;
        }
        if (Array.isArray(value)) {
          const scalars = [];
          const norm = value.map((v) => {
            if (isPlainObject(v)) return v;
            if (field.by && isIdValue(v)) return { [store.idField(ref)]: v };
            scalars.push(v);
            return null;
          }).filter(v => v);
          norm.forEach(val => exports.resolveModelWhereClause(parser, store, ref, val, field.alias || key, lookups2D, index + 1));
          if (scalars.length) prev[key] = scalars;
          return prev;
        }

        if (field.by) {
          exports.resolveModelWhereClause(parser, store, ref, { [store.idField(ref)]: value }, field.alias || key, lookups2D, index + 1);
          return prev;
        }
      }

      return Object.assign(prev, { [key]: value });
    }, {}),
  });

  if (index === 0) {
    if (lookups2D.length === 1) {
      const [{ query }] = lookups2D[0].lookups;
      return query;
    }

    return promiseChain(lookups2D.reverse().map(({ lookups }, index2D) => {
      return () => Promise.all(lookups.map(async ({ modelName, query }) => {
        const parentLookup = lookups2D[index2D + 1] || { parentDataRefs: new Set() };
        const { parentModelName, parentFields, parentDataRefs } = parentLookup;
        const { parentModelName: currentModelName, parentFields: currentFields, parentFieldAlias: currentFieldAlias } = lookups2D[index2D];

        return store.find(modelName, { where: query }).then((results) => {
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
      const [{ query }] = lookups2D[lookups2D.length - 1].lookups;
      return query;
    });
  }

  // Must be a nested call; nothing to do
  return undefined;
};

exports.resolveReferentialIntegrity = async (parser, store, model, id) => {
  const onDeletes = parser.getModelOnDeletes(model);
  const doc = await store.get(model, id);
  return doc;
};

exports.sortData = (data, sortBy) => {
  const paths = keyPaths(sortBy);

  const info = paths.reduce((prev, path, i) => {
    const nextPath = paths[i + 1] || '';
    const prevPath = paths[i - 1] || '';

    if (nextPath.indexOf(`${path}.`) === 0) return prev;
    if (prevPath.indexOf(path) === 0) return prev; // Work to do here (nested path)

    const order = _.get(sortBy, path, 'asc').toLowerCase();
    prev.iteratees.push(path);
    prev.orders.push(order);
    return prev;
  }, {
    iteratees: [],
    orders: [],
  });

  return _.orderBy(data, info.iteratees, info.orders);
};

exports.filterDataByCounts = (store, model, data, countPaths) => {
  return data.filter(doc => Object.entries(countPaths).every(([path, value]) => String(_.get(doc, path, '')).match(globToRegexp(value))));
};
