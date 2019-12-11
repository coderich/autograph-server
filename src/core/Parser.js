const { isScalarValue } = require('../service/app.service');

module.exports = class Parser {
  constructor(schema) {
    this.schema = schema;
  }

  getSchema() {
    return this.schema;
  }

  getModel(model) {
    return this.schema[model];
  }

  getModelFields(model) {
    return this.getModel(model).fields;
  }

  getModelNames(getAll = true) {
    return Object.entries(this.schema).filter(([, modelDef]) => getAll || !modelDef.hideFromApi).map(([model]) => model);
  }

  getModelNamesAndFields(getAll = true) {
    return Object.entries(this.schema).filter(([, modelDef]) => getAll || !modelDef.hideFromApi).map(([model, def]) => [model, def.fields]);
  }

  static isScalarField(field) {
    const type = Parser.getFieldDataType(field);
    return Array.isArray(type) ? isScalarValue(type[0]) : isScalarValue(type);
  }

  static getFieldDataRef(field) {
    const val = Parser.getFieldDataType(field);
    const ref = Array.isArray(val) ? val[0] : val;
    return isScalarValue(ref) ? null : ref;
  }

  static getFieldDataType(field) {
    switch (field) {
      case String: return 'String';
      case Number: return 'Float';
      case Boolean: return 'Boolean';
      default: {
        if (Array.isArray(field)) return [Parser.getFieldDataType(field[0])];
        if (field instanceof Object) return Parser.getFieldDataType(field.type);
        return field;
      }
    }
  }
};
