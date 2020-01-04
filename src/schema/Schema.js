const Model = require('./Model');

module.exports = class Schema {
  constructor(schema, stores) {
    this.schema = schema;
    this.models = Object.entries(schema).map(([model, options]) => new Model(this, model, options));
  }

  getModel(name) {
    return this.models.find(model => model.getName() === name);
  }

  getModels() {
    return this.models;
  }

  getVisibleModels() {
    return this.models.filter(model => model.isVisible());
  }

  // static identifyOnDeletes(schema) {
  //   return Object.keys(schema).reduce((prev, modelName) => {
  //     const arr = [];

  //     Object.entries(schema).forEach(([model, modelDef]) => {
  //       Object.entries(modelDef.fields).forEach(([field, fieldDef]) => {
  //         const ref = Parser.getFieldDataRef(fieldDef);
  //         const { onDelete } = fieldDef;

  //         if (ref === modelName && onDelete) {
  //           arr.push({ model, field, isArray: Boolean(Parser.getFieldArrayType(fieldDef)), onDelete });
  //         }
  //       });
  //     });

  //     return Object.assign(prev, { [modelName]: arr });
  //   }, {});
  // }
};
