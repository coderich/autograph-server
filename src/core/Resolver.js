const _ = require('lodash');
const GraphqlFields = require('graphql-fields');
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

const normalizeQuery = (args = {}, info) => {
  const query = { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query };
  const { fields = {} } = query;
  const { first, last, before, after } = args;
  return Object.assign(query, { pagination: { first, last, before, after }, fields: _.get(fields, 'edges.node') });
};

module.exports = class Resolver {
  constructor() {
    // Getter
    this.get = ({ store }, model, guid, required = false, info) => {
      const query = { fields: GraphqlFields(info, {}, { processArguments: true }) };

      return store.get(model, guidToId(guid), query).then((doc) => {
        if (!doc && required) throw new NotFoundError(`${model} Not Found`);
        return doc;
      });
    };

    // Query
    this.query = ({ store }, model, args, info) => store.query(model, normalizeQuery(args, info));
    this.count = ({ store }, model, args, info) => store.count(model, args.where);

    // Mutations
    this.create = ({ store }, model, data, query) => store.create(model, unrollGuid(store, model, data), query);
    this.update = ({ store }, model, guid, data, query) => store.update(model, guidToId(guid), unrollGuid(store, model, data), query);
    this.delete = ({ store }, model, guid, query) => store.delete(model, guidToId(guid), query);
  }
};
