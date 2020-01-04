const { request: Request } = require('graphql-request');
const { isScalarField } = require('../src/core/Parser');
const { ucFirst, proxyDeep } = require('../src/service/app.service');

module.exports = class {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  query(op, method, model, data = {}) {
    // const fields = this.parser.getModelFields(model);
    const scalars = Object.entries(fields).filter(([, field]) => isScalarField(field)).map(([field]) => field);
    const objects = Object.entries(fields).filter(([, field]) => !isScalarField(field)).map(([field]) => field);
    return Request(this.endpoint, `${op} ${method}${model} (${data.id ? '$id: ID! ' : ''}$data: ${model}Input${ucFirst(method)}!) {
      ${method}${model} (${data.id ? 'id: $id ' : ''}data: $data) {
        id
        ${scalars.map(key => key)}
        ${objects.map(key => `${key} { id }`)}
      }
    }`, { data }).then((result) => {
      const doc = result[Object.keys(result)[0]];

      return proxyDeep(doc, {
        get(target, prop, rec) {
          const value = Reflect.get(target, prop, rec);

          if (objects.indexOf(prop)) {
            if (Array.isArray(value)) return value.map(val => val.id);
            if (typeof value === 'object') return value.id;
          }

          return value;
        },
      });
    });
  }

  create(model, data) {
    return this.query('mutation', 'create', model, data);
  }

  update(model, data, id) {
    return this.query('mutation', 'update', model, { id, ...data });
  }
};
