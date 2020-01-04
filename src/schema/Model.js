const Field = require('./Field');
const { lcFirst } = require('../service/app.service');

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

  idField() {
    return this.driver.idField;
  }

  async hydrate(loader, results, query = {}) {
    const { fields = {} } = query;
    const isArray = Array.isArray(results);
    const modelFields = this.getFields().map(f => f.getName());
    const fieldEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(k) > -1);
    const countEntries = Object.entries(fields).filter(([k]) => modelFields.indexOf(lcFirst(k.substr(5))) > -1); // eg. countAuthored
    results = isArray ? results : [results];

    const data = await Promise.all(results.map(async (doc) => {
      // Resolve all values
      const [fieldValues, countValues] = await Promise.all([
        Promise.all(fieldEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.query).map(el => el.query.value); // eslint-disable-line
          const ref = this.getField(field).getDataRef();
          const resolved = await loader.resolve(this, doc, field, { ...query, ...arg });
          if (Object.keys(subFields).length && ref) return this.schema.getModel(ref).hydrate(loader, resolved, { ...query, ...arg, fields: subFields });
          return resolved;
        })),
        Promise.all(countEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.where).map(el => el.where.value); // eslint-disable-line
          return loader.rollup(this, doc, lcFirst(field.substr(5)), arg);
        })),
      ]);

      return fieldEntries.reduce((prev, [field], i) => {
        prev[field] = doc[field]; // Retain original values

        // $hydrated values
        const $value = fieldValues[i];
        // const def = this.parser.getModelFieldDef(model, field);
        // if (Array.isArray($value) && def) return Object.assign(prev, { [`$${field}`]: $value.map() });
        return Object.assign(prev, { [`$${field}`]: $value });
      }, countEntries.reduce((prev, [field], i) => {
        return Object.assign(prev, { [field]: countValues[i] });
      }, {
        id: doc.id,
        $id: doc.$id,
      }));
    }));

    return isArray ? data : data[0];
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
