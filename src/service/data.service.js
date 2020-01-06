const _ = require('lodash');
const { ObjectID } = require('mongodb');
const { NotFoundError, BadRequestError } = require('../service/error.service');
const { uniq, globToRegexp, isScalarValue, isPlainObject, promiseChain, isIdValue, keyPaths } = require('../service/app.service');

exports.ensureModel = (store, model, id) => {
  return store.get(model, id).then((doc) => {
    if (!doc) throw new NotFoundError(`${model} Not Found`);
    return doc;
  });
};

exports.validateModelData = (store, model, data, oldData, op) => {
  const promises = [];
  const modelName = model.getName();
  const fields = model.getFields();

  fields.forEach((field) => {
    const key = field.getName();
    const rules = field.getRules() || [];
    const ref = field.getModelRef();
    const isTypeArray = field.isArray();
    const value = data[key];
    const path = `${modelName}.${key}`;
    const isValueArray = Array.isArray(value);

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
        if (field.isEmbedded()) {
          promises.push(...value.map(v => exports.validateModelData(store, ref, v, oldData, op)));
        } else {
          promises.push(...value.map(v => exports.ensureModel(store, ref, v)));
          value.forEach(v => rules.forEach(rule => rule(v, oldData, op, path)));
        }
      } else {
        value.forEach(v => rules.forEach(rule => rule(v, oldData, op, path)));
      }
    } else if (ref) {
      if (field.isEmbedded()) {
        promises.push(exports.validateModelData(store, ref, value, oldData, op));
      } else {
        promises.push(exports.ensureModel(store, ref, value));
      }
    }
  });

  return Promise.all(promises);
};

exports.ensureModelArrayTypes = (store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = model.getField(key);
    if (value == null || field == null) return prev;

    // Ensure array if type array
    if (field.isArray() && !Array.isArray(value)) prev[key] = [value];

    return prev;
  }, data);
};

exports.applyFieldValueTransform = (field, value) => {
  const type = field.getSimpleType();
  const transforms = field.getTransforms() || [];

  switch (type) {
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

exports.normalizeModelWhere = (store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = model.getField(key);
    if (value == null || field == null) return prev;

    const ref = field.getModelRef();

    if (ref) {
      if (isPlainObject(value)) {
        prev[key] = exports.normalizeModelWhere(store, ref, value);
      } else if (Array.isArray(value)) {
        prev[key] = value.map((val) => {
          if (isPlainObject(val)) return exports.normalizeModelWhere(store, ref, val);
          if (isIdValue(val)) return store.idValue(ref, val);
          return val;
        });
      } else {
        prev[key] = store.idValue(ref, value);
      }
    } else if (Array.isArray(value)) {
      prev[key] = value.map(val => exports.applyFieldValueTransform(field, val));
    } else {
      prev[key] = exports.applyFieldValueTransform(field, value);
    }

    return prev;
  }, data);
};

exports.normalizeModelData = (store, model, data) => {
  return Object.entries(data).reduce((prev, [key, value]) => {
    const field = model.getField(key);
    if (value == null || field == null) return prev;

    const ref = field.getModelRef();
    const type = field.getDataType();

    if (isPlainObject(value) && ref) {
      prev[key] = exports.normalizeModelData(store, ref, value);
    } else if (Array.isArray(value)) {
      if (ref) {
        if (field.isEmbedded() || field.isVirtual()) {
          prev[key] = value.map(v => exports.normalizeModelData(store, ref, v));
        } else if (type.isSet) {
          prev[key] = uniq(value).map(v => store.idValue(ref, v));
        } else {
          prev[key] = value.map(v => store.idValue(ref, v));
        }
      } else {
        prev[key] = value.map(v => exports.applyFieldValueTransform(field, v));
        if (type.isSet) prev[key] = uniq(prev[key]);
      }
    } else if (ref) {
      prev[key] = store.idValue(ref, value);
    } else {
      prev[key] = exports.applyFieldValueTransform(field, value);
    }

    return prev;
  }, data);
};

exports.resolveModelWhereClause = (store, model, where = {}, fieldAlias = '', lookups2D = [], index = 0) => {
  const mName = model.getName();
  const fields = model.getFields();

  //
  lookups2D[index] = lookups2D[index] || {
    parentFieldAlias: fieldAlias,
    parentModelName: mName,
    parentFields: fields,
    parentDataRefs: new Set(model.getDataRefFields().map(f => f.getDataRef())),
    lookups: [],
  };

  // Depth first traversal to create 2d array of lookups
  lookups2D[index].lookups.push({
    modelName: mName,
    query: Object.entries(where).reduce((prev, [key, value]) => {
      const field = model.getField(key);

      if (field) {
        const ref = field.getModelRef();

        if (ref) {
          if (isPlainObject(value)) {
            exports.resolveModelWhereClause(store, ref, value, field.getAlias(key), lookups2D, index + 1);
            return prev;
          }
          if (Array.isArray(value)) {
            const scalars = [];
            const norm = value.map((v) => {
              if (isPlainObject(v)) return v;
              if (field.isVirtual() && isIdValue(v)) return { [store.idField(ref)]: v };
              scalars.push(v);
              return null;
            }).filter(v => v);
            norm.forEach(val => exports.resolveModelWhereClause(store, ref, val, field.getAlias(key), lookups2D, index + 1));
            if (scalars.length) prev[key] = scalars;
            return prev;
          }

          if (field.isVirtual()) {
            exports.resolveModelWhereClause(store, ref, { [store.idField(ref)]: value }, field.getAlias(key), lookups2D, index + 1);
            return prev;
          }
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
              parentFields.forEach((field) => {
                const ref = field.getDataRef();

                if (ref === modelName) {
                  if (field.isVirtual()) {
                    const cField = currentFields.find(f => f.getName() === field.getVirtualRef());
                    const cAlias = cField.getAlias(field.getVirtualRef());

                    Object.assign(lookup.query, {
                      [store.idField(parentModelName)]: results.map((result) => {
                        const cValue = result[cAlias];
                        return store.idValue(parentModelName, cValue);
                      }),
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

exports.resolveReferentialIntegrity = async (store, model, id) => {
  // const onDeletes = parser.getModelOnDeletes(model);
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
