const Field = require('./Field');

module.exports = class Model {
  constructor(schema, name, options = {}) {
    this.schema = schema;
    this.name = name;
    this.options = options;
    this.fields = Object.entries(options.fields).map(([field, def]) => new Field(schema, this, field, def));
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

  getEmbeddedArrayFields() {
    return this.fields.filter(field => field.isArray() && !field.isVirtual());
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

  getDataRefFields() {
    return this.fields.filter(field => Boolean(field.getDataRef()));
  }

  getScalarFields() {
    return this.fields.filter(field => field.isScalar());
  }

  getAlias() {
    return this.options.alias || this.getName();
  }

  getIndexes() {
    return this.options.indexes || [];
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

  toGUID(id) {
    return Buffer.from(`${this.getName()},${id}`).toString('base64');
  }
};
