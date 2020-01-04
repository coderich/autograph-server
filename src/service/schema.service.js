const _ = require('lodash');
const GraphqlFields = require('graphql-fields');
const { withFilter, PubSub } = require('graphql-subscriptions');
const DataLoader = require('../core/DataLoader');
const Resolver = require('../core/Resolver');
const { internalEmitter: Emitter } = require('./event.service');
const { ucFirst, hashObject, fromGUID } = require('./app.service');

const pubsub = new PubSub();

/* eslint-disable indent, no-underscore-dangle */
exports.createGraphSchema = (parser, schema) => {
  const resolver = new Resolver(parser, schema);

  Emitter.on('postMutation', ({ store }) => {
    const loader = (store instanceof DataLoader ? store : store.dataLoader());
    schema.getVisibleModels().forEach(model => pubsub.publish(`${model.getName()}Trigger`, { store: loader }));
  });

  Emitter.on('preMutation', ({ method, store }, next) => {
    const beforeStore = (store instanceof DataLoader ? store : store.dataLoader());
    const afterStore = store.dataLoader();

    Promise.all(schema.getVisibleModels().map((model) => {
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
            if (ref) return `${fieldName}(query: ${ref}InputQuery): ${field.getGQLType().concat(field.isRequired() ? '!' : '')}`;
            return `${fieldName}: ${field.getGQLType().concat(field.isRequired() ? '!' : '')}`;
          })}
          countSelf(where: ${modelName}InputWhere): Int!
          ${model.getCountableFields().map(field => `count${ucFirst(field.getName())}(where: ${field.getDataRef()}InputWhere): Int!`)}
        }

        type ${modelName}Subscription {
          op: String!
          model: ${modelName}!
        }

        input ${modelName}InputCreate {
          ${model.getCreateFields().map(field => `${field.getName()}: ${field.getGQLType('InputCreate').concat(field.isRequired() ? '!' : '')}`)}
        }

        input ${modelName}InputUpdate {
          ${model.getUpdateFields().map(field => `${field.getName()}: ${field.getGQLType('InputUpdate')}`)}
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
        ${schema.getVisibleModels().map(model => `get${model.getName()}(id: ID!): ${model.getName()}`)}
        ${schema.getVisibleModels().map(model => `find${model.getName()}(query: ${ucFirst(model.getName())}InputQuery): [${model.getName()}]!`)}
        ${schema.getVisibleModels().map(model => `count${model.getName()}(where: ${ucFirst(model.getName())}InputWhere): Int!`)}
      }`,

      `type System {
        ${schema.getVisibleModels().map(model => `get${model.getName()}(id: ID!): ${model.getName()}`)}
        ${schema.getVisibleModels().map(model => `find${model.getName()}(query: ${ucFirst(model.getName())}InputQuery): [${model.getName()}]!`)}
        ${schema.getVisibleModels().map(model => `count${model.getName()}(where: ${ucFirst(model.getName())}InputWhere): Int!`)}
      }`,

      `type Subscription {
        ${schema.getVisibleModels().map(model => `${model.getName()}Trigger(query: ${ucFirst(model.getName())}InputQuery): [${model.getName()}]!`)}
        ${schema.getVisibleModels().map(model => `${model.getName()}Changed(query: ${ucFirst(model.getName())}InputQuery): [${model.getName()}Subscription]!`)}
      }`,

      `type Mutation {
        ${schema.getVisibleModels().map(model => `create${model.getName()}(data: ${model.getName()}InputCreate!): ${model.getName()}!`)}
        ${schema.getVisibleModels().map(model => `update${model.getName()}(id: ID! data: ${model.getName()}InputUpdate!): ${model.getName()}!`)}
        ${schema.getVisibleModels().map(model => `delete${model.getName()}(id: ID!): ${model.getName()}!`)}
        ${schema.getVisibleModels().map(model => `
          ${model.getEmbeddedArrayFields().map((field) => {
            const modelName = model.getName();
            const fieldName = field.getName();
            const inputType = field.getGQLType('InputCreate');

            return `
              add${modelName}${ucFirst(fieldName)}(id: ID! ${fieldName}: ${inputType}!): ${modelName}!
              rem${modelName}${ucFirst(fieldName)}(id: ID! query: ID!): ${modelName}!
            `;
          })}
        `)}
      }`,
    ]),
    resolvers: schema.getModels().reduce((prev, model) => {
      const modelName = model.getName();

      return Object.assign(prev, {
        [modelName]: model.getFields().reduce((def, field) => {
          const fieldName = field.getName();
          return Object.assign(def, { [fieldName]: root => root[`$${fieldName}`] });
        }, {
          // id: root => root.$id,
          countSelf: (root, args, context) => resolver.count(context, model, args.where),
        }),
      });
    }, {
      Node: {
        __resolveType: async (root, args, context, info) => {
          return fromGUID(root.id).split(':')[0];
        },
      },
      Query: schema.getVisibleModels().reduce((prev, model) => {
        const modelName = model.getName();

        return Object.assign(prev, {
          [`get${modelName}`]: (root, args, context) => resolver.get(context, modelName, args.id, true),
          [`find${modelName}`]: (root, args, context, info) => resolver.query(context, modelName, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query }),
          [`count${modelName}`]: (root, args, context) => resolver.count(context, modelName, args.where),
        });
      }, {
        System: (root, args) => ({}),
        node: (root, args, context) => {
          const { id } = args;
          const [modelName] = fromGUID(id).split(':');
          return resolver.get(context, modelName, id);
        },
      }),

      Mutation: schema.getVisibleModels().reduce((prev, model) => {
        const modelName = model.getName();

        return Object.assign(prev, {
          [`create${modelName}`]: (root, args, context) => resolver.create(context, modelName, args.data),
          [`update${modelName}`]: (root, args, context) => resolver.update(context, modelName, args.id, args.data),
          [`delete${modelName}`]: (root, args, context) => resolver.delete(context, modelName, args.id),
        });
      }, {}),

      System: schema.getVisibleModels().reduce((prev, model) => {
        const modelName = model.getName();

        return Object.assign(prev, {
          [`get${modelName}`]: (root, args, context) => resolver.get(context, modelName, args.id, true),
          [`find${modelName}`]: (root, args, context, info) => resolver.query(context, modelName, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query }),
          [`count${modelName}`]: (root, args, context) => resolver.count(context, modelName, args.where),
        });
      }, {}),

      Subscription: schema.getVisibleModels().reduce((prev, model) => {
        const modelName = model.getName();

        return Object.assign(prev, {
          [`${modelName}Trigger`]: {
            subscribe: () => pubsub.asyncIterator(`${modelName}Trigger`),
            resolve: (root, args, context, info) => {
              const { store } = root;
              context.store = store;
              return store.query(modelName, { fields: GraphqlFields(info, {}, { processArguments: true }), ...args.query });
            },
          },
          [`${modelName}Changed`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${modelName}Changed`),
              (root, args1, context, info) => {
                let nextPromise;
                const args = _.cloneDeep(args1);
                const sid = hashObject({ modelName, args });
                const { beforeStore, afterStore } = root;
                const action = `${modelName}Changed`;
                const fields = GraphqlFields(info, {}, { processArguments: true });
                context.subscriptions = context.subscriptions || {};
                context.subscriptions[sid] = [];

                // Let them know we're listening and to wait for us...
                root.next = new Promise(resolve => (nextPromise = resolve));

                return new Promise((resolve, reject) => {
                  beforeStore.query(modelName, { fields, ...args.query }).then((before) => {
                    context.store = afterStore;

                    Emitter.once('postMutation', async (event) => {
                      const after = await afterStore.query(modelName, { fields, ...args.query });
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
              const sid = hashObject({ modelName, args });
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
