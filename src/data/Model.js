const Field = require('./Field');
const { lcFirst, map, toGUID } = require('../service/app.service');


module.exports = class Model {
  constructor(schema, name, driver, options = {}) {
    this.schema = schema;
    this.name = name;
    this.driver = driver;
    this.options = options;
    this.fields = Object.entries(options.fields).map(([field, def]) => new Field(schema, this, field, def));
    this.toString = () => `${name}`;

    // Create indexes
    driver.dao.createIndexes(this.getAlias(), this.getIndexes());
  }

  // CRUD
  get(id) {
    return this.driver.dao.get(this.getAlias(), this.idValue(id)).then(res => this.toObject(res));
  }

  find(where = {}) {
    return this.driver.dao.find(this.getAlias(), where).then(res => this.toObject(res));
  }

  count(where = {}) {
    return this.driver.dao.count(this.getAlias(), where);
  }

  create(data) {
    return this.driver.dao.create(this.getAlias(), data).then(res => this.toObject(res));
  }

  update(id, data, doc) {
    return this.driver.dao.replace(this.getAlias(), this.idValue(id), data, doc).then(res => this.toObject(res));
  }

  delete(id, doc) {
    return this.driver.dao.delete(this.getAlias(), this.idValue(id), doc).then(res => this.toObject(res));
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

  toObject(docs) {
    return map(docs, (doc) => {
      const guid = toGUID(this.getName(), doc.id);

      return Object.defineProperties(doc, {
        $id: { value: guid },
        $$cursor: { value: guid },
      });
    });
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
          const resolved = await this.getField(field).resolve(loader, doc, { ...query, ...arg });
          if (Object.keys(subFields).length && ref) return this.schema.getModel(ref).hydrate(loader, resolved, { ...query, ...arg, fields: subFields });
          return resolved;
        })),
        Promise.all(countEntries.map(async ([field, subFields]) => {
          const [arg = {}] = (fields[field].__arguments || []).filter(el => el.where).map(el => el.where.value); // eslint-disable-line
          return this.getField(lcFirst(field.substr(5))).count(loader, doc, arg);
        })),
      ]);

      return fieldEntries.reduce((prev, [field], i) => {
        const $key = `$${field}`;
        const $value = fieldValues[i];
        if (!Object.prototype.hasOwnProperty.call(prev, $key)) Object.defineProperty(prev, $key, { value: $value });
        return prev;
      }, countEntries.reduce((prev, [field], i) => {
        return Object.assign(prev, { [field]: countValues[i] });
      }, doc));
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

  getDriver() {
    return this.driver.dao;
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
};