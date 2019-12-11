const Parser = require('../core/Parser');
const { ucFirst, isScalarValue } = require('./app.service');

const getFieldType = (model, field, fieldDef, suffix) => {
  const dataType = Parser.getFieldDataType(fieldDef);
  let type = Array.isArray(dataType) ? dataType[0] : dataType;
  if (suffix && !isScalarValue(type)) type = fieldDef.embedded ? `${type}${suffix}` : 'ID';
  if (fieldDef.enum) type = `${model}${ucFirst(field)}Enum`;
  return Array.isArray(dataType) ? `[${type}]` : type;
};

/* eslint-disable indent */
exports.createGraphSchema = (parser, resolver) => {
  return {
    typeDefs: parser.getModelNamesAndFields().map(([model, fields]) => `
      type ${model} {
        id: ID!
        ${
          Object.entries(fields)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(model, field, fieldDef).concat(fieldDef.required ? '!' : '')}`)
        }
      }

      input ${model}InputCreate {
        ${
          Object.entries(fields)
          .filter(([field, fieldDef]) => !fieldDef.by)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(model, field, fieldDef, 'InputCreate').concat(fieldDef.required ? '!' : '')}`)
        }
      }

      input ${model}InputUpdate {
        ${
          Object.entries(fields)
          .filter(([field, fieldDef]) => !fieldDef.by && !fieldDef.immutable)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(model, field, fieldDef, 'InputUpdate')}`)
        }
      }

      ${
        Object.entries(fields).filter(([field, fieldDef]) => fieldDef.enum).map(([field, fieldDef]) => {
          return `
            enum ${model}${ucFirst(field)}Enum { ${fieldDef.enum.join(' ')} }
          `;
        })
      }
    `).concat([
      'scalar Mixed',
      'input FilterInput { key: String! value: Mixed! }',
      `type System {
        ${parser.getModelNames(false).map(model => `get${model}(id: ID!): ${model}`)}
        ${parser.getModelNames(false).map(model => `find${model}(filter: FilterInput): [${model}]!`)}
      }`,
      `type Query {
        System: System!
      }`,
      `type Mutation {
        ${parser.getModelNames(false).map(model => `create${model}(data: ${model}InputCreate!): ${model}!`)}
        ${parser.getModelNames(false).map(model => `update${model}(id: ID! data: ${model}InputUpdate!): ${model}!`)}
        ${parser.getModelNames(false).map(model => `delete${model}(id: ID!): ${model}!`)}
        ${parser.getModelNamesAndFields(false).map(([model, fields]) => `
          ${Object.entries(fields).filter(([field, fieldDef]) => {
            if (fieldDef.by) return false;
            return Parser.getFieldArrayType(fieldDef);
          }).map(([field, fieldDef]) => {
            return `
              add${model}${ucFirst(field)}(id: ID! ${field}: ${getFieldType(model, field, fieldDef, 'InputCreate')}!): ${model}!
            `;
          })}
        `)}
      }`,
    ]),
    resolvers: parser.getModelNamesAndFields().reduce((prev, [model, fields]) => {
      return Object.assign(prev, {
        [model]: Object.entries(fields).filter(([field, fieldDef]) => !Parser.isScalarField(fieldDef) && !fieldDef.embedded).reduce((def, [field, fieldDef]) => {
          return Object.assign(def, {
            [field]: (root, args) => {
              const fieldType = getFieldType(model, field, fieldDef);
              const arrayType = Parser.getFieldArrayType(fieldDef);

              if (arrayType) {
                if (fieldDef.by) return resolver.find(arrayType, { [fieldDef.by]: root.id });
                return Promise.all((root[field] || []).map(id => resolver.get(arrayType, id, fieldDef.required).catch(() => null)));
              }

              if (fieldDef.by) return resolver.find(fieldType, { [fieldDef.by]: root.id }).then(results => results[0]);
              return resolver.get(fieldType, root[field], fieldDef.required);
            },
          });
        }, {}),
      });
    }, {
      System: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context, info) => resolver.get(model, args.id, true),
          [`find${model}`]: (root, args, context, info) => resolver.find(model, args.filter),
        });
      }, {}),

      Query: {
        System: (root, args, context, info) => ({}),
      },

      Mutation: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`create${model}`]: (root, args, context, info) => resolver.create(model, args.data),
          [`update${model}`]: (root, args, context, info) => resolver.update(model, args.id, args.data),
          [`delete${model}`]: (root, args, context, info) => resolver.delete(model, args.id),
        });
      }, {}),
    }),
    context: {},
  };
};
