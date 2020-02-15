const { ApolloServer, makeExecutableSchema } = require('apollo-server');
const { Schema, Resolver } = require('@coderich/autograph');
const { Quin, Rule } = require('@coderich/autograph/quin');
const SchemaService = require('../src/service/schema.service');
const stores = require('./stores');
const gql = require('./schema');

//
Quin.extend('bookName', Rule.deny('The Bible'));
Quin.extend('bookPrice', Rule.range(0, 100));
Quin.extend('artComment', Rule.allow('yay', 'great', 'boo'));
Quin.extend('colors', Rule.allow('blue', 'red', 'green', 'purple'));
Quin.extend('buildingType', Rule.allow('home', 'office', 'business'));

const schema = new Schema(gql, stores);
const graphSchema = SchemaService.createGraphSchema(schema);
const executableSchema = makeExecutableSchema(graphSchema);

const apolloServer = new ApolloServer({
  schema: executableSchema,
  context: () => ({ loader: new Resolver(schema) }),
});

apolloServer.listen(3000).then(({ url, subscriptionsUrl }) => {
  console.log(`Server running: ${url}`);
  console.log(`Subscriptions running: ${subscriptionsUrl}`);
});
