const Field = require('./Field');

module.exports = class Model {
  constructor(schema, name, options = {}) {
    this.schema = schema;
    this.name = name;
    this.options = options;
    this.fields = Object.entries(options.fields).map(([field, def]) => new Field(this, field, def));
  }

  getName() {
    return this.name;
  }

  getField(name) {
    return this.fields.find(field => field.getName() === name);
  }

  getFields() {
    return this.fields;
  }

  getCountableFields() {
    return this.fields.filter(field => field.isArray() && field.getDataRef());
  }

  getCreateFields() {
    return this.fields.filter(field => !field.isVirtual());
  }

  getUpdateFields() {
    return this.fields.filter(field => !field.isVirtual() && !field.isImmutable());
  }

  getAlias() {
    return this.options.alias || this.name;
  }

  getDriver() {
    return this.options.store || 'default';
  }

  isHidden() {
    return this.options.hideFromApi;
  }

  isVisible() {
    return !this.isHidden();
  }
};
