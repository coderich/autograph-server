const { ApolloServer, makeExecutableSchema } = require('apollo-server');
const { Schema, DataLoader } = require('@coderich/dataloader');
const SchemaService = require('./service/schema.service');
const { schema: schemaDef, stores } = require('./schema');

const schema = new Schema(schemaDef, stores);
const graphSchema = SchemaService.createGraphSchema(schema);
const executableSchema = makeExecutableSchema(graphSchema);

const apolloServer = new ApolloServer({
  schema: executableSchema,
  context: () => ({ loader: new DataLoader(schema) }),
});

apolloServer.listen(3000).then(({ url, subscriptionsUrl }) => {
  console.log(`Server running: ${url}`);
  console.log(`Subscriptions running: ${subscriptionsUrl}`);
});
