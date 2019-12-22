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

  getModelFieldDef(model, field) {
    return this.getModel(model).fields[field];
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

  getModelNamesAndStores() {
    return this.getModelNames().map(modelName => [modelName, this.getModelStore(modelName)]);
  }

  getModelDataRefs(model) {
    const fields = this.getModelFields(model);
    return Object.values(fields).map(field => Parser.getFieldDataRef(field)).filter(ref => ref);
  }

  getModelOnDeletes(model) {
    return Parser.identifyOnDeletes(this.schema)[model];
  }

  static isScalarValue(value) {
    return ['String', 'Float', 'Boolean'].indexOf(value) > -1;
  }

  static isScalarField(field) {
    const type = Parser.getFieldDataType(field);
    return Array.isArray(type) ? Parser.isScalarValue(type[0]) : Parser.isScalarValue(type);
  }

  static getFieldDataRef(field) {
    const val = Parser.getFieldDataType(field);
    const ref = Array.isArray(val) ? val[0] : val;
    return Parser.isScalarValue(ref) ? null : ref;
  }

  static getFieldArrayType(field) {
    const type = Parser.getFieldDataType(field);
    return Array.isArray(type) ? type[0] : null;
  }

  static getFieldSimpleType(field) {
    const val = Parser.getFieldDataType(field);
    return Array.isArray(val) ? val[0] : val;
  }

  static getFieldDataType(field) {
    switch (field) {
      case String: return 'String';
      case Number: return 'Float';
      case Boolean: return 'Boolean';
      default: {
        if (Array.isArray(field)) { field[0] = Parser.getFieldDataType(field[0]); return field; }
        if (field instanceof Object) return Parser.getFieldDataType(field.type);
        return field;
      }
    }
  }

  static identifyOnDeletes(schema) {
    return Object.keys(schema).reduce((prev, modelName) => {
      const arr = [];

      Object.entries(schema).forEach(([model, modelDef]) => {
        Object.entries(modelDef.fields).forEach(([field, fieldDef]) => {
          const ref = Parser.getFieldDataRef(fieldDef);
          const { onDelete } = fieldDef;

          if (ref === modelName && onDelete) {
            arr.push({ model, field, isArray: Boolean(Parser.getFieldArrayType(fieldDef)), onDelete });
          }
        });
      });

      return Object.assign(prev, { [modelName]: arr });
    }, {});
  }
};
