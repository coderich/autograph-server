const _ = require('lodash');
const { NotFoundError } = require('../service/error.service');
const { fromGUID, map } = require('../service/app.service');

const guidToId = guid => fromGUID(guid)[1];

const unrollGuid = (store, model, data) => {
  model = store.toModel(model);
  const fields = model.getDataRefFields().map(field => field.getName());

  return map(data, (doc) => {
    return Object.entries(doc).reduce((prev, [key, value]) => {
      return Object.assign(prev, { [key]: (fields.indexOf(key) > -1 ? guidToId(value) : value) });
    }, {
      id: guidToId(doc.id),
    });
  });
};

const normalizeQuery = (query = {}) => {
  const { fields = {} } = query;
  query.fields = _.get(fields, 'edges.node');
  return query;
};

module.exports = class Resolver {
  constructor() {
    this.get = ({ store }, model, guid, required = false, query = {}) => {
      return store.get(model, guidToId(guid), query).then((doc) => {
        if (!doc && required) throw new NotFoundError(`${model} Not Found`);
        return doc;
      });
    };

    this.query = ({ store }, model, query = {}) => store.query(model, normalizeQuery(query));
    this.find = ({ store }, model, query = {}) => store.find(model, normalizeQuery(query));
    this.count = ({ store }, model, where = {}) => store.count(model, where);
    this.create = ({ store }, model, data, query) => store.create(model, unrollGuid(store, model, data), query);
    this.update = ({ store }, model, guid, data, query) => store.update(model, guidToId(guid), unrollGuid(store, model, data), query);
    this.delete = ({ store }, model, guid, query) => store.delete(model, guidToId(guid), query);
  }
};
