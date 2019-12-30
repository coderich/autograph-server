const Boom = require('@hapi/boom');

module.exports = class Resolver {
  constructor(parser) {
    this.parser = parser;

    this.get = ({ store }, model, id, required = false) => {
      return store.get(model, id).then((doc) => {
        if (!doc && required) throw Boom.notFound(`${model} Not Found`);
        return doc;
      });
    };

    this.find = ({ store }, model, args = {}) => store.find(model, args);
    this.count = ({ store }, model, args = {}) => store.count(model, args);
    this.create = ({ store }, model, data) => store.create(model, data);
    this.update = ({ store }, model, id, data) => store.update(model, id, data);
    this.delete = ({ store }, model, id) => store.delete(model, id);
  }
};
