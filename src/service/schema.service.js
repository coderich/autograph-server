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
        [model]: Object.entries(fields).filter(([field, fieldDef]) => !fieldDef.embedded).reduce((def, [field, fieldDef]) => {
          return Object.assign(def, {
            [field]: (root, args) => {
              const value = root[parser.getModelFieldId(model, field)];
              const dataType = Parser.getFieldDataType(fieldDef);

              // Scalar Resolvers
              if (Parser.isScalarField(fieldDef)) return value;

              // Array Resolvers
              if (Array.isArray(dataType)) {
                if (fieldDef.by) return resolver.find(dataType[0], { [parser.getModelFieldId(dataType[0], fieldDef.by)]: root.id });
                return Promise.all((value || []).map(id => resolver.get(dataType[0], id, fieldDef.required).catch(() => null)));
              }

              // Object Resolvers
              if (fieldDef.by) return resolver.find(dataType, { [parser.getModelFieldId(dataType, fieldDef.by)]: root.id }).then(results => results[0]);
              return resolver.get(dataType, value, fieldDef.required);
            },
          });
        }, {}),
      });
    }, {
      System: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args) => resolver.get(model, args.id, true),
          [`find${model}`]: (root, args) => resolver.find(model, args.filter),
        });
      }, {}),

      Query: {
        System: (root, args) => ({}),
      },

      Mutation: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`create${model}`]: (root, args) => resolver.create(model, args.data),
          [`update${model}`]: (root, args) => resolver.update(model, args.id, args.data),
          [`delete${model}`]: (root, args) => resolver.delete(model, args.id),
        });
      }, {}),
    }),
    context: {},
  };
};
