const { ApolloServer, makeExecutableSchema } = require('apollo-server');
const { Schema, Resolver } = require('@coderich/autograph');
const { createGraphSchema } = require('../service/schema.service');

module.exports = class Server {
  constructor(gql, stores) {
    const schema = new Schema(gql, stores);
    const graphSchema = createGraphSchema(schema);
    const executableSchema = makeExecutableSchema(graphSchema);

    this.server = new ApolloServer({
      schema: executableSchema,
      context: () => ({
        schema,
        permissions: ['**'],
        loader: new Resolver(schema),
      }),
    });
  }

  start() {
    this.server.listen(3000).then(({ url, subscriptionsUrl }) => {
      console.log(`Server running: ${url}`);
      console.log(`Subscriptions running: ${subscriptionsUrl}`);
    });
  }
};
