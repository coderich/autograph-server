const _ = require('lodash');
const GraphqlFields = require('graphql-fields');
const { withFilter, PubSub } = require('graphql-subscriptions');
const DataLoader = require('../core/DataLoader');
const Parser = require('../core/Parser');
const Resolver = require('../core/Resolver');
const { internalEmitter: Emitter } = require('./event.service');
const { ucFirst, hashObject } = require('./app.service');

const pubsub = new PubSub();

const getFieldType = (model, field, fieldDef, suffix) => {
  const dataType = Parser.getFieldDataType(fieldDef);
  let type = Array.isArray(dataType) ? dataType[0] : dataType;
  if (suffix && !Parser.isScalarValue(type)) type = fieldDef.embedded ? `${type}${suffix}` : 'ID';
  if (fieldDef.enum) type = `${model}${ucFirst(field)}Enum`;
  return Array.isArray(dataType) ? `[${type}]` : type;
};

/* eslint-disable indent, no-underscore-dangle */
exports.createGraphSchema = (parser) => {
  const resolver = new Resolver(parser);

  Emitter.on('postMutation', ({ store }) => {
    const loader = (store instanceof DataLoader ? store : store.dataLoader());
    parser.getModelNames(false).forEach(model => pubsub.publish(`${model}Trigger`, { store: loader }));
  });

  Emitter.on('preMutation', ({ method, store }, next) => {
    const beforeStore = (store instanceof DataLoader ? store : store.dataLoader());
    const afterStore = store.dataLoader();

    Promise.all(parser.getModelNames(false).map((model) => {
      const payload = { method, beforeStore, afterStore, next: undefined };

      return new Promise((resolve) => {
        pubsub.publish(`${model}Changed`, payload);

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
    typeDefs: parser.getModelNamesAndFields().map(([model, fields]) => `
      type ${model} {
        ${parser.getModel(model).hideFromApi ? '' : 'id: ID!'}
        ${Object.entries(fields).map(([field, fieldDef]) => {
          if (Parser.getFieldDataRef(fieldDef)) return `${field}(query: ${model}InputQuery): ${getFieldType(model, field, fieldDef).concat(fieldDef.required ? '!' : '')}`;
          return `${field}: ${getFieldType(model, field, fieldDef).concat(fieldDef.required ? '!' : '')}`;
        })}
        countSelf(where: ${model}InputWhere): Int!
        ${parser.getModelFieldsAndDataRefs(model).filter(([,,, isArray]) => isArray).map(([field, ref]) => `count${ucFirst(field)}(where: ${ref}InputWhere): Int!`)}
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

      input ${model}InputWhere {
        ${
          Object.entries(fields).map(([field, fieldDef]) => {
            const ref = Parser.getFieldDataRef(fieldDef);
            return `${field}: ${ref ? `${ucFirst(ref)}InputWhere` : 'String'}`;
          })
        }
      }

      input ${model}InputSort {
        ${
          Object.entries(fields).map(([field, fieldDef]) => {
            const ref = Parser.getFieldDataRef(fieldDef);
            return `${field}: ${ref ? `${ucFirst(ref)}InputSort` : 'SortOrderEnum'}`;
          }).concat(
            'countSelf: SortOrderEnum',
            parser.getModelFieldsAndDataRefs(model).filter(([,,, isArray]) => isArray).map(([field, ref]) => `count${ucFirst(field)}: SortOrderEnum`),
          )
        }
      }

      input ${model}InputQuery {
        where: ${model}InputWhere
        sortBy: ${model}InputSort
        limit: Int
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

      'enum SortOrderEnum { ASC DESC }',

      `type Query {
        System: System!
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
            [field]: (root, args, context) => resolver.resolve(context, model, root, field, args.query),
          });
        }, parser.getModelFieldsAndDataRefs(model).filter(([,,, isArray]) => isArray).reduce((counters, [field, ref, by]) => {
          return Object.assign(counters, {
            [`count${ucFirst(field)}`]: (root, args, context) => {
              return resolver.rollup(context, model, root, field, args.where);
            },
          });
        }, {
          countSelf: (root, args, context) => resolver.count(context, model, args.where),
        })),
      });
    }, {
      Query: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context, info) => resolver.find(context, model, { fields: GraphqlFields(info), ...args.query }),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {
        System: (root, args) => ({}),
      }),

      System: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`get${model}`]: (root, args, context) => resolver.get(context, model, args.id, true),
          [`find${model}`]: (root, args, context, info) => resolver.find(context, model, { fields: GraphqlFields(info), ...args.query }),
          [`count${model}`]: (root, args, context) => resolver.count(context, model, args.where),
        });
      }, {}),

      Subscription: parser.getModelNames(false).reduce((prev, model) => {
        return Object.assign(prev, {
          [`${model}Trigger`]: {
            subscribe: () => pubsub.asyncIterator(`${model}Trigger`),
            resolve: (root, args, context) => {
              const { store } = root;
              context.store = store;
              return store.find(model, args.query);
            },
          },
          [`${model}Changed`]: {
            subscribe: withFilter(
              () => pubsub.asyncIterator(`${model}Changed`),
              (root, args1, context) => {
                let nextPromise;
                const args = _.cloneDeep(args1);
                const sid = hashObject({ model, args });
                const { beforeStore, afterStore } = root;
                const action = `${model}Changed`;
                context.subscriptions = context.subscriptions || {};
                context.subscriptions[sid] = [];

                // Let them know we're listening and to wait for us...
                root.next = new Promise(resolve => (nextPromise = resolve));

                return new Promise((resolve, reject) => {
                  beforeStore.find(model, args.query).then((before) => {
                    context.store = afterStore;

                    Emitter.once('postMutation', async (event) => {
                      const after = await afterStore.find(model, args.query);
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
