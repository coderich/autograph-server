const Model = require('./Model');

module.exports = class Schema {
  constructor(schema) {
    this.schema = schema;
    this.models = Object.entries(schema).map(([model, options]) => new Model(this, model, options));
  }

  getModel(name) {
    return this.models.find(model => model.getName() === name);
  }

  getModels() {
    return this.models;
  }

  getVisibleModels() {
    return this.models.filter(model => model.isVisible());
  }
};
