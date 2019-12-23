const Hapi = require('@hapi/hapi');
const { ApolloServer, makeExecutableSchema } = require('apollo-server-hapi');
const Parser = require('./core/Parser');
const Resolver = require('./core/Resolver');
const Store = require('./core/Store');
const SchemaService = require('./service/schema.service');
const { schema, stores } = require('../schema');

const parser = new Parser(schema);
const store = new Store(parser, stores);
const resolver = new Resolver(parser);
const hapiServer = Hapi.server({ port: 3000 });
const graphSchema = SchemaService.createGraphSchema(parser, resolver);
const executableSchema = makeExecutableSchema(graphSchema);

const apolloServer = new ApolloServer({
  schema: executableSchema,
  context: async ({ request, h }) => {
    const { payload: { operationName } } = request;

    if (operationName !== 'IntrospectionQuery') {
      return { store };
    }

    return {};
  },
});

apolloServer.applyMiddleware({ app: hapiServer });
hapiServer.start();
