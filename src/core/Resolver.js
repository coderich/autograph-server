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

module.exports = class Resolver {
  constructor() {
    this.get = ({ store }, model, guid, required = false) => {
      return store.get(model, guidToId(guid)).then((doc) => {
        if (!doc && required) throw new NotFoundError(`${model} Not Found`);
        return doc;
      });
    };

    this.query = ({ store }, model, query = {}) => store.query(model, query);
    this.find = ({ store }, model, query = {}) => store.find(model, query);
    this.count = ({ store }, model, where = {}) => store.count(model, where);
    this.rollup = ({ store }, model, doc, field, where = {}) => store.rollup(model, unrollGuid(store, model, doc), field, where);
    this.resolve = ({ store }, model, doc, field, query = {}) => store.resolve(model, unrollGuid(store, model, doc), field, query);
    this.create = ({ store }, model, data) => store.create(model, unrollGuid(store, model, data));
    this.update = ({ store }, model, guid, data) => store.update(model, guidToId(guid), unrollGuid(store, model, data));
    this.delete = ({ store }, model, guid) => store.delete(model, guidToId(guid));
  }
};
