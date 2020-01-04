const Field = require('./Field');

module.exports = class Model {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;

    this.fields = Object.entries(options).reduce((prev, [field, def]) => {
      return Object.assign(prev, { [field]: new Field(field, def) });
    }, {});
  }

  getAlias() {
    return this.options.alias || this.name;
  }

  getDriver() {
    return this.options.store || 'default';
  }
};
