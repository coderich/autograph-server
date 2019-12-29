const { withFilter, PubSub } = require('graphql-subscriptions');
const Parser = require('../core/Parser');
const Resolver = require('../core/Resolver');
const { eventEmitter: Emitter } = require('./event.service');
const { ucFirst, hashObject } = require('./app.service');

const pubsub = new PubSub();

const getFieldType = (model, field, fieldDef, suffix) => {
  const dataType = Parser.getFieldDataType(fieldDef);
  let type = Array.isArray(dataType) ? dataType[0] : dataType;
  if (suffix && !Parser.isScalarValue(type)) type = fieldDef.embedded ? `${type}${suffix}` : 'ID';
  if (fieldDef.enum) type = `${model}${ucFirst(field)}Enum`;
  return Array.isArray(dataType) ? `[${type}]` : type;
};

Emitter.on('preMutation', (event, next) => {
  const { model, method } = event;
  const action = `${model}Changed`;
  pubsub.publish(action, { [action]: { method, next } });
});

/* eslint-disable indent, no-underscore-dangle */
exports.createGraphSchema = (parser) => {
  const resolver = new Resolver(parser);

  return {
    typeDefs: parser.getModelNamesAndFields().map(([model, fields]) => `
      type ${model} {
        ${parser.getModel(model).hideFromApi ? '' : 'id: ID!'}
        ${
          Object.entries(fields)
          .map(([field, fieldDef]) => `${field}: ${getFieldType(model, field, fieldDef).concat(fieldDef.required ? '!' : '')}`)
        }
      }

      type ${model}Subscription {
        op: String!
        model: ${model}!
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

      input ${model}InputQuery {
        ${
          Object.entries(fields).map(([field, fieldDef]) => {
            const ref = Parser.getFieldDataRef(fieldDef);
            return `${field}: ${ref ? `${ucFirst(ref)}InputQuery` : 'String'}`;
          })
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

      `type Query {
        System: System!
        ${parser.getModelNames(false).map(model => `get${model}(id: ID!): ${model}`)}
        ${parser.getModelNames(false).map(model => `find${model}(where: ${ucFirst(model)}InputQuery): [${model}]!`)}
        ${parser.getModelNames(false).map(model => `count${model}(where: ${ucFirst(model)}InputQuery): Int!`)}
      }`,

      `type System {
        ${parser.getModelNames(false).map(model => `get${model}(id: ID!): ${model}`)}
        ${parser.getModelNames(false).map(model => `find${model}(where: ${ucFirst(model)}InputQuery): [${model}]!`)}
        ${parser.getModelNames(false).map(model => `count${model}(where: ${ucFirst(model)}InputQuery): Int!`)}
      }`,

      `type Subscription {
        ${parser.getModelNames(false).map(model => `${model}Changed(where: ${ucFirst(model)}InputQuery): ${model}Subscription!`)}
        ${parser.getModelNames(false).map(model => `${model}Created(where: ${ucFirst(model)}InputQuery): ${model}!`)}
        ${parser.getModelNames(false).map(model => `${model}Updated(where: ${ucFirst(model)}InputQuery): ${model}!`)}
        ${parser.getModelNames(false).map(model => `${model}Deleted(where: ${ucFirst(model)}InputQuery): ${model}!`)}
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
            const inputType = getFieldType(model, field, fieldDef, 'InputCreate');
            // const queryType = getFieldType(model, field, fieldDef, 'InputUpdate');

            return `
              add${model}${ucFirst(field)}(id: ID! ${field}: ${inputType}!): ${model}!
              rem${model}${ucFirst(field)}(id: ID! query: ID!): ${model}!
            `;
          })}
        `)}
      }`,
    ]),
    resolvers: parser.getModelNamesAndFields().reduce((prev, [model, fields]) => {
      return Object.assign(prev, {
        [model]: Object.entries(fields).filter(([field, fieldDef]) => !fieldDef.embedded).reduce((def, [field, fieldDef]) => {
          return Object.assign(def, {
            [field]: (root, args, context) => {
              const value = root[parser.getModelFieldAlias(model, field)];
              const dataType = Parser.getFieldDataType(fieldDef);

              // Scalar Resolvers
              if (Parser.isScalarField(fieldDef)) return value;

              // Array Resolvers
              if (Array.isArray(dataType)) {
                if (fieldDef.by) return resolver.find(context, dataType[0], { [parser.getModelFieldAlias(dataType[0], fieldDef.by)]: root.id });
                return Promise.all((value || []).map(id => resolver.get(context, dataType[0], id, fieldDef.required).catch(() => null)));
              }

              // Object Resolvers
              if (fieldDef.by) return resolver.find(context, dataType, { [parser.getModelFieldAlias(dataType, fieldDef.by)]: root.id }).then(results => results[0]);
              return resolver.get(context, dataType, value, fieldDef.required);
            },
          });
        }, {
          // // ID Resolver
          // id: (root, args) => root.id,
        }),
      });
    }, {
      Query: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context) => resolver.find(context, model, args.where),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {
        System: (root, args) => ({}),
      }),

      System: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context) => resolver.find(context, model, args.where),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {}),

      Subscription: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`${model}Changed`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Changed`),
              (root, args, context) => {
                return new Promise((resolve, reject) => {
                  // Do lookups to get data before mutation
                  const { method, next } = root[`${model}Changed`];
                  // const { store } = context;
                  const sid = hashObject({ model, args });
                  context.subscriptions = context.subscriptions || {};

                  // Register for the post
                  Emitter.once('postMutation', (event) => {
                    const { model: modelName, method: methodName, result } = event;

                    if (model === modelName && method === methodName) {
                      const action = `${model}Changed`;
                      context.subscriptions[sid] = { [action]: { op: method, model: result } };
                      resolve(true);
                    } else {
                      resolve(false);
                    }
                  });

                  //
                  next();
                });
              },
            ),
            resolve: (root, args, context) => {
              const sid = hashObject({ model, args });
              const [data] = Object.values(context.subscriptions[sid]);
              return data;
            },
          },
          [`${model}Created`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Created`),
              (root, args, context) => {
                const where = Object.assign(root[`${model}Created`], args.where);
                return resolver.find(context, model, where).then(([res]) => Boolean(res));
              },
            ),
          },
          [`${model}Updated`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Updated`),
              (root, args, context) => {
                const where = Object.assign(root[`${model}Updated`], args.where);
                return resolver.find(context, model, where).then(([res]) => Boolean(res));
              },
            ),
          },
          [`${model}Deleted`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Deleted`),
              (root, args, context) => {
                const where = Object.assign(root[`${model}Deleted`], args.where);
                return resolver.find(context, model, where).then(([res]) => Boolean(res));
              },
            ),
          },
        });
      }, {}),

      Mutation: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`create${model}`]: (root, args, context) => resolver.create(context, model, args.data),
          [`update${model}`]: (root, args, context) => resolver.update(context, model, args.id, args.data),
          [`delete${model}`]: (root, args, context) => resolver.delete(context, model, args.id),
        });
      }, {}),
    }),
    context: {},
  };
};
