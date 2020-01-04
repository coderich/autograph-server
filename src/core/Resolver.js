const { NotFoundError } = require('../service/error.service');
const { pullID } = require('../service/app.service');

module.exports = class Resolver {
  constructor() {
    this.get = ({ store }, model, id, required = false) => {
      return store.get(model, pullID(model, id)).then((doc) => {
        if (!doc && required) throw new NotFoundError(`${model} Not Found`);
        return doc;
      });
    };

    this.query = ({ store }, model, query = {}) => store.query(model, query);
    this.find = ({ store }, model, query = {}) => store.find(model, query);
    this.count = ({ store }, model, where = {}) => store.count(model, where);
    this.rollup = ({ store }, model, doc, field, where = {}) => store.rollup(model, doc, field, where);
    this.resolve = ({ store }, model, doc, field, query = {}) => store.resolve(model, doc, field, query);
    this.create = ({ store }, model, data) => store.create(model, data);
    this.update = ({ store }, model, id, data) => store.update(model, pullID(model, id), data);
    this.delete = ({ store }, model, id) => store.delete(model, pullID(model, id));
  }
};
