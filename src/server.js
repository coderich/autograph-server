const { ApolloServer, makeExecutableSchema } = require('apollo-server');
const Parser = require('./core/Parser');
const Store = require('./core/Store');
const SchemaService = require('./service/schema.service');
const { schema, stores } = require('../schema');

const parser = new Parser(schema);
const store = new Store(parser, stores);
const graphSchema = SchemaService.createGraphSchema(parser);
const executableSchema = makeExecutableSchema(graphSchema);

const apolloServer = new ApolloServer({
  schema: executableSchema,
  context: (request) => ({ store: store.dataLoader() }),
});

apolloServer.listen(3000).then(({ url, subscriptionsUrl }) => {
  console.log(`Server running: ${url}`);
  console.log(`Subscriptions running: ${subscriptionsUrl}`);
});
