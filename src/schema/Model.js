const Field = require('./Field');
// const {
//   ensureModel,
//   ensureModelArrayTypes,
//   validateModelData,
//   normalizeModelData,
//   normalizeModelWhere,
//   resolveModelWhereClause,
//   resolveReferentialIntegrity,
//   sortData,
//   filterDataByCounts,
// } = require('../service/data.service');

module.exports = class Model {
  constructor(schema, name, driver, options = {}) {
    this.schema = schema;
    this.name = name;
    this.driver = driver;
    this.options = options;
    this.fields = Object.entries(options.fields).map(([field, def]) => new Field(schema, this, field, def));

    // Create indexes
    driver.dao.createIndexes(this.getAlias(), this.getIndexes());
  }

  // CRUD
  get(id) {
    return this.driver.dao.get(this.getAlias(), this.idValue(id));
  }

  find(where = {}) {
    return this.driver.dao.find(this.getAlias(), where);
  }

  count(where = {}) {
    return this.driver.dao.count(this.getAlias(), where);
  }

  create(data) {
    return this.driver.dao.create(this.getAlias(), data);
  }

  update(id, data, doc) {
    return this.driver.dao.replace(this.getAlias(), this.idValue(id), data, doc);
  }

  delete(id, doc) {
    return this.driver.dao.delete(this.getAlias(), this.idValue(id), doc);
  }

  drop() {
    return this.driver.dao.dropModel(this.getAlias());
  }

  idValue(id) {
    return this.driver.idValue(id);
  }

  //

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

  getDriverName() {
    return this.options.driver || 'default';
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
