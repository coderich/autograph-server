const _ = require('lodash');
const GraphqlFields = require('graphql-fields');
const { withFilter, PubSub } = require('graphql-subscriptions');
const DataLoader = require('../core/DataLoader');
const Parser = require('../core/Parser');
const Resolver = require('../core/Resolver');
const { internalEmitter: Emitter } = require('./event.service');
const { ucFirst, hashObject, fromGUID } = require('./app.service');

const pubsub = new PubSub();

const getFieldType = (model, field, fieldDef, suffix) => {
  const dataType = Parser.getFieldDataType(fieldDef);
  let type = Array.isArray(dataType) ? dataType[0] : dataType;
  if (suffix && !Parser.isScalarValue(type)) type = fieldDef.embedded ? `${type}${suffix}` : 'ID';
  if (fieldDef.enum) type = `${model}${ucFirst(field)}Enum`;
  return Array.isArray(dataType) ? `[${type}]` : type;
};

/* eslint-disable indent, no-underscore-dangle */
exports.createGraphSchema = (parser, schema) => {
  const resolver = new Resolver(parser);

  Emitter.on('postMutation', ({ store }) => {
    const loader = (store instanceof DataLoader ? store : store.dataLoader());
    schema.getModels(false).forEach(model => pubsub.publish(`${model.getName()}Trigger`, { store: loader }));
  });

  Emitter.on('preMutation', ({ method, store }, next) => {
    const beforeStore = (store instanceof DataLoader ? store : store.dataLoader());
    const afterStore = store.dataLoader();

    Promise.all(schema.getModels(false).map((model) => {
      const payload = { method, beforeStore, afterStore, next: undefined };

      return new Promise((resolve) => {
        pubsub.publish(`${model.getName()}Changed`, payload);

        setTimeout(() => {
          if (!payload.next) return resolve();
          return payload.next.then(() => resolve());
        });
      });
    })).then(() => {
      next();
    });
  });

  return {
    typeDefs: schema.getModels().map((model) => {
      const modelName = model.getName();

      return `
        type ${modelName} implements Node {
          id: ID!
          ${model.getFields().map((field) => {
            const fieldName = field.getName();
            const ref = field.getDataRef();
            if (ref) return `${fieldName}(query: ${ref}InputQuery): ${field.toGQL().concat(field.isRequired() ? '!' : '')}`;
            return `${fieldName}: ${field.toGQL().concat(field.isRequired() ? '!' : '')}`;
          })}
          countSelf(where: ${modelName}InputWhere): Int!
          ${model.getCountableFields().map(field => `count${ucFirst(field.getName())}(where: ${field.getDataRef()}InputWhere): Int!`)}
        }

        type ${modelName}Subscription {
          op: String!
          model: ${modelName}!
        }

        input ${modelName}InputCreate {
          ${model.getCreateFields().map(field => `${field.getName()}: ${field.toGQL('InputCreate').concat(field.isRequired() ? '!' : '')}`)}
        }

        input ${modelName}InputUpdate {
          ${model.getUpdateFields().map(field => `${field.getName()}: ${field.toGQL('InputUpdate')}`)}
        }

        input ${modelName}InputWhere {
          ${model.getFields().map(field => `${field.getName()}: ${field.getDataRef() ? `${ucFirst(field.getDataRef())}InputWhere` : 'String'}`)}
          countSelf: String
          ${model.getCountableFields().map(field => `count${ucFirst(field.getName())}: String`)}
        }

        input ${modelName}InputSort {
          ${model.getFields().map(field => `${field.getName()}: ${field.getDataRef() ? `${ucFirst(field.getDataRef())}InputSort` : 'SortOrderEnum'}`)}
          countSelf: SortOrderEnum
          ${model.getCountableFields().map(field => `count${ucFirst(field.getName())}: SortOrderEnum`)}
        }

        input ${modelName}InputQuery {
          where: ${modelName}InputWhere
          sortBy: ${modelName}InputSort
          limit: Int
        }
      `;
    }).concat([
      `
      type Connection {
        edges: [Edge]
        pageInfo: PageInfo!
      }

      type Edge {
        node: Node
        cursor: String!
      }

      type PageInfo {
        startCursor: String!
        endCursor: String!
        hasPreviousPage: Boolean!
        hasNextPage: Boolean!
      }

      interface Node {
        id: ID!
      }

      enum SortOrderEnum { ASC DESC }
      `,

      `type Query {
        System: System!
        node(id: ID!): Node
        ${parser.getModelNames(false).map(model => `get${model}(id: ID!): ${model}`)}
        ${parser.getModelNames(false).map(model => `find${model}(query: ${ucFirst(model)}InputQuery): [${model}]!`)}
        ${parser.getModelNames(false).map(model => `count${model}(where: ${ucFirst(model)}InputWhere): Int!`)}
      }`,

      `type System {
        ${parser.getModelNames(false).map(model => `get${model}(id: ID!): ${model}`)}
        ${parser.getModelNames(false).map(model => `find${model}(query: ${ucFirst(model)}InputQuery): [${model}]!`)}
        ${parser.getModelNames(false).map(model => `count${model}(where: ${ucFirst(model)}InputWhere): Int!`)}
      }`,

      `type Subscription {
        ${parser.getModelNames(false).map(model => `${model}Trigger(query: ${ucFirst(model)}InputQuery): [${model}]!`)}
        ${parser.getModelNames(false).map(model => `${model}Changed(query: ${ucFirst(model)}InputQuery): [${model}Subscription]!`)}
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
            [field]: root => root[`$${field}`],
          });
        }, parser.getModelFieldsAndDataRefs(model).filter(([,,, isArray]) => isArray).reduce((counters, [field, ref, by]) => {
          return counters;
        }, {
          // id: root => root.$id,
          countSelf: (root, args, context) => resolver.count(context, model, args.where),
        })),
      });
    }, {
      Node: {
        __resolveType: async (root, args, context, info) => {
          return fromGUID(root.id).split(':')[0];
        },
      },
      Query: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context, info) => resolver.query(context, model, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query }),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {
        System: (root, args) => ({}),
        node: (root, args, context) => {
          const { id } = args;
          const [model] = fromGUID(id).split(':');
          return resolver.get(context, model, id);
        },
      }),

      Mutation: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`create${model}`]: (root, args, context) => resolver.create(context, model, args.data),
          [`update${model}`]: (root, args, context) => resolver.update(context, model, args.id, args.data),
          [`delete${model}`]: (root, args, context) => resolver.delete(context, model, args.id),
        });
      }, {}),

      System: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context, info) => resolver.query(context, model, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query }),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {}),

      Subscription: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`${model}Trigger`]: {
            subscribe: () => pubsub.asyncIterator(`${model}Trigger`),
            resolve: (root, args, context, info) => {
              const { store } = root;
              context.store = store;
              return store.query(model, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query });
            },
          },
          [`${model}Changed`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Changed`),
              (root, args1, context, info) => {
                let nextPromise;
                const args = _.cloneDeep(args1);
                const sid = hashObject({ model, args });
                const { beforeStore, afterStore } = root;
                const action = `${model}Changed`;
                const fields = GraphqlFields(info, {}, { processArguments: true });
                context.subscriptions = context.subscriptions || {};
                context.subscriptions[sid] = [];

                // Let them know we're listening and to wait for us...
                root.next = new Promise(resolve => (nextPromise = resolve));

                return new Promise((resolve, reject) => {
                  beforeStore.query(model, { fields, ...args.query }).then((before) => {
                    context.store = afterStore;

                    Emitter.once('postMutation', async (event) => {
                      const after = await afterStore.query(model, { fields, ...args.query });
                      const diff = _.xorWith(before, after, (a, b) => `${a.id}` === `${b.id}`);
                      const updated = _.intersectionWith(before, after, (a, b) => `${a.id}` === `${b.id}`).filter((el) => {
                        const a = before.find(e => `${e.id}` === `${el.id}`);
                        const b = after.find(e => `${e.id}` === `${el.id}`);
                        return hashObject(a) !== hashObject(b);
                      }).map((el) => {
                        return after.find(e => `${e.id}` === `${el.id}`);
                      });

                      const added = diff.filter((el) => {
                        const a = before.find(e => `${e.id}` === `${el.id}`);
                        const b = after.find(e => `${e.id}` === `${el.id}`);
                        return Boolean(!a && b);
                      });

                      const deleted = diff.filter((el) => {
                        const a = before.find(e => `${e.id}` === `${el.id}`);
                        const b = after.find(e => `${e.id}` === `${el.id}`);
                        return Boolean(a && !b);
                      });

                      if (!updated.length && !added.length && !deleted.length) return resolve(false);

                      updated.forEach(result => context.subscriptions[sid].push({ [action]: { op: 'update', model: result } }));
                      added.forEach(result => context.subscriptions[sid].push({ [action]: { op: 'create', model: result } }));
                      deleted.forEach(result => context.subscriptions[sid].push({ [action]: { op: 'delete', model: result } }));
                      return resolve(true);
                    });

                    nextPromise();
                  });
                });
              },
            ),
            resolve: (root, args, context) => {
              const sid = hashObject({ model, args });
              const results = context.subscriptions[sid];

              return results.map((result) => {
                const [data] = Object.values(result);
                return data;
              });
            },
          },
        });
      }, {}),
    }),
    context: {},
  };
};
