const Model = require('./Model');

module.exports = class Schema {
  constructor(schema) {
    this.schema = schema;
    this.models = Object.entries(schema).map(([model, options]) => new Model(this, model, options));
  }

  getModel(name) {
    return this.models.find(model => model.getName() === name);
  }

  getModels(getAll = true) {
    return this.models.filter(model => getAll || model.isVisible());
  }

  static isScalarValue(value) {
    return ['String', 'Float', 'Boolean'].indexOf(value) > -1;
  }
};
