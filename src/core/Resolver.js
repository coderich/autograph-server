const _ = require('lodash');
const GraphqlFields = require('graphql-fields');
const { NotFoundError } = require('@coderich/dataloader/errors');
const { fromGUID, map } = require('../service/app.service');

const guidToId = guid => fromGUID(guid)[1];

const unrollGuid = (loader, model, data) => {
  model = loader.toModel(model);
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
    this.get = ({ loader }, model, guid, required = false, info) => {
      const query = { fields: GraphqlFields(info, {}, { processArguments: true }) };

      return loader.get(model, guidToId(guid)).query(query).exec().then((doc) => {
        if (!doc && required) throw new NotFoundError(`${model} Not Found`);
        return doc;
      });
    };

    // Query
    this.query = ({ loader }, model, args, info) => loader.query(model).query(normalizeQuery(args, info)).exec();
    this.count = ({ loader }, model, args, info) => loader.count(model).where(args.where).exec();

    // Mutations
    this.create = ({ loader }, model, data, query) => loader.create(model, unrollGuid(loader, model, data), query);
    this.update = ({ loader }, model, guid, data, query) => loader.update(model, guidToId(guid), unrollGuid(loader, model, data), query);
    this.delete = ({ loader }, model, guid, query) => loader.delete(model, guidToId(guid), query);
  }
};
