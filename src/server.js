const { ApolloServer, makeExecutableSchema } = require('apollo-server');
const Schema = require('./schema/Schema');
const Store = require('./core/Store');
const SchemaService = require('./service/schema.service');
const { schema: schemaDef, stores } = require('../schema');

const schema = new Schema(schemaDef, stores);
const store = new Store(schema, stores);
const graphSchema = SchemaService.createGraphSchema(schema);
const executableSchema = makeExecutableSchema(graphSchema);

const apolloServer = new ApolloServer({
  schema: executableSchema,
  context: (request) => ({ store: store.dataLoader() }),
});

apolloServer.listen(3000).then(({ url, subscriptionsUrl }) => {
  console.log(`Server running: ${url}`);
  console.log(`Subscriptions running: ${subscriptionsUrl}`);
});
