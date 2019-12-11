const Parser = require('../core/Parser');
const { ucFirst, isScalarValue } = require('./app.service');

const getFieldType = (field, suffix) => {
  const dataType = Parser.getFieldDataType(field);
  let type = Array.isArray(dataType) ? dataType[0] : dataType;
  if (suffix && !isScalarValue(type)) type = field.embedded ? `${type}${suffix}` : 'ID';
  return Array.isArray(dataType) ? `[${type}]` : type;
};

const getArrayType = str => (str.match(/\[(.*?)\]/) || [])[1];

/* eslint-disable indent */
exports.createGraphSchema = (parser, resolver) => {
  return {
    typeDefs: parser.getModelNamesAndFields().map(([model, fields]) => `
      type ${model} {
        id: ID!
        ${
          Object.entries(fields)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(fieldDef).concat(fieldDef.required ? '!' : '')}`)
        }
      }

      input ${model}InputCreate {
        ${
          Object.entries(fields)
          .filter(([field, fieldDef]) => !fieldDef.by)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(fieldDef, 'InputCreate').concat(fieldDef.required ? '!' : '')}`)
        }
      }

      input ${model}InputUpdate {
        ${
          Object.entries(fields)
          .filter(([field, fieldDef]) => !fieldDef.by && !fieldDef.immutable)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(fieldDef, 'InputUpdate')}`)
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
          ${Object.entries(fields).map(([field, fieldDef]) => {
            if (fieldDef.by) return [field, null];
            return [field, getArrayType(getFieldType(fieldDef, 'InputCreate'))];
          }).filter(([a, b]) => b).map(([fieldName, fieldType]) => {
            return `add${model}${ucFirst(fieldName)}(id: ID! ${fieldName}: [${fieldType}!]!): ${model}!`;
          })}
        `)}
      }`,
    ]),
    resolvers: parser.getModelNamesAndFields().reduce((prev, [model, fields]) => {
      return Object.assign(prev, {
        [model]: Object.entries(fields).filter(([field, fieldDef]) => !Parser.isScalarField(fieldDef) && !fieldDef.embedded).reduce((def, [field, fieldDef]) => {
          return Object.assign(def, {
            [field]: (root, args) => {
              const fieldType = getFieldType(fieldDef);
              const arrayType = getArrayType(fieldType);

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
