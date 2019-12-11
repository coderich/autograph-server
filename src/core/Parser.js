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

  getModelAlias(model) {
    return this.getModel(model).alias || model;
  }

  getModelIdFieldAndType(model) {
    const modelDef = this.getModelNames(model);
    return [modelDef.id || 'id', modelDef.idType, modelDef.idType || String];
  }

  getModelStore(model) {
    return this.getModel(model).store || 'default';
  }

  getModelFields(model) {
    return this.getModel(model).fields;
  }

  getModelFieldAlias(model, field) {
    return this.getModel(model).fields[field].alias || field;
  }

  getModelNames(getAll = true) {
    return Object.entries(this.schema).filter(([, modelDef]) => getAll || !modelDef.hideFromApi).map(([model]) => model);
  }

  getModelNamesAndFields(getAll = true) {
    return Object.entries(this.schema).filter(([, modelDef]) => getAll || !modelDef.hideFromApi).map(([model, { fields }]) => [model, fields]);
  }

  getModelNamesAndIndexes() {
    return Object.entries(this.schema).filter(([, { indexes }]) => indexes).map(([model, { indexes }]) => [model, indexes]);
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

  static getFieldArrayType(field) {
    const type = Parser.getFieldDataType(field);
    return Array.isArray(type) ? type[0] : null;
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
