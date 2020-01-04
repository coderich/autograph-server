const _ = require('lodash');
const { ucFirst, isScalarValue, isScalarDataType } = require('../service/app.service');

module.exports = class Field {
  constructor(schema, model, name, options = {}) {
    this.schema = schema;
    this.model = model;
    this.name = name;
    this.options = options;
  }

  // CRUD
  count(loader, doc, w = {}) {
    const where = _.cloneDeep(w);
    const fieldRef = this.getDataRef();

    if (this.isVirtual()) {
      where[this.getVirtualRef()] = doc.id;
      return loader.count(fieldRef, where);
    }

    if (!Object.keys(where).length) {
      return (doc[this.getName()] || []).length; // Making big assumption that it's an array
    }

    const ids = (doc[this.getName()] || []);
    where[loader.idField(fieldRef)] = ids;
    return loader.count(fieldRef, where);
  }

  resolve(loader, doc, q = {}) {
    const query = _.cloneDeep(q);
    const dataType = this.getDataType();
    const value = doc[this.getAlias()];
    query.where = query.where || {};

    // Scalar Resolvers
    if (this.isScalar()) return value;

    // Array Resolvers
    if (Array.isArray(dataType)) {
      if (this.isVirtual()) {
        query.where[this.getVirtualField().getAlias()] = doc.id;
        return loader.find(dataType[0], query);
      }
      const valueIds = (value || []).map(v => (isScalarValue(v) ? v : v.id));
      return Promise.all(valueIds.map(id => loader.get(dataType[0], id, this.isRequired()).catch(() => null)));
    }

    // Object Resolvers
    if (this.isVirtual()) {
      query.where[this.getVirtualField().getAlias()] = doc.id;
      return loader.find(dataType, query).then(results => results[0]);
    }

    const id = isScalarValue(value) ? value : value.id;
    return loader.get(dataType, id, this.isRequired());
  }

  //

  getName() {
    return this.name;
  }

  getSimpleType() {
    const val = this.getDataType();
    return Array.isArray(val) ? val[0] : val;
  }

  getDataType(field = this.options) {
    switch (field) {
      case String: return 'String';
      case Number: return 'Float';
      case Boolean: return 'Boolean';
      default: {
        if (Array.isArray(field)) { field[0] = this.getDataType(field[0]); return field; }
        if (field instanceof Object) return this.getDataType(field.type);
        return field;
      }
    }
  }

  getGQLType(suffix) {
    let type = this.getSimpleType();
    if (suffix && !isScalarDataType(type)) type = this.options.embedded ? `${type}${suffix}` : 'ID';
    if (this.options.enum) type = `${this.model.getName()}${ucFirst(this.getName())}Enum`;
    return this.isArray() ? `[${type}]` : type;
  }

  getDataRef() {
    const ref = this.getSimpleType();
    return isScalarDataType(ref) ? null : ref;
  }

  getModelRef() {
    return this.schema.getModel(this.getDataRef());
  }

  getAlias(alias) {
    return this.options.alias || alias || this.getName();
  }

  getVirtualRef() {
    return this.options.by;
  }

  getVirtualModel() {
    return this.schema.getModel(this.getSimpleType());
  }

  getVirtualField() {
    return this.getVirtualModel().getField(this.getVirtualRef());
  }

  getTransforms() {
    return this.options.transforms;
  }

  getRules() {
    return this.options.rules;
  }

  isArray() {
    return Array.isArray(this.getDataType());
  }

  isScalar() {
    return isScalarDataType(this.getSimpleType());
  }

  isRequired() {
    return this.options.required;
  }

  isVirtual() {
    return Boolean(this.options.by);
  }

  isImmutable() {
    return this.options.immutable;
  }

  isEmbedded() {
    return this.options.embedded;
  }
};
