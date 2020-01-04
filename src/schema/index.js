const Model = require('./Model');

module.exports = class Schema {
  constructor(schema) {
    this.schema = schema;

    this.models = Object.entries(schema).reduce((prev, [model, options]) => {
      return Object.assign(prev, { [model]: new Model(model, options) });
    }, {});
  }

  getModel(name) {
    return this.models[name];
  }
};
