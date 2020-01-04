const { ucFirst, isScalarDataType } = require('../service/app.service');

module.exports = class Field {
  constructor(model, name, options = {}) {
    this.model = model;
    this.name = name;
    this.options = options;
  }

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

  getDataRef() {
    const ref = this.getSimpleType();
    return isScalarDataType(ref) ? null : ref;
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

  toGQL(suffix) {
    let type = this.getSimpleType();
    if (suffix && !isScalarDataType(type)) type = this.options.embedded ? `${type}${suffix}` : 'ID';
    if (this.options.enum) type = `${this.model.getName()}${ucFirst(this.getName())}Enum`;
    return this.isArray() ? `[${type}]` : type;
  }
};
