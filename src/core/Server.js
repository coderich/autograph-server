const { ApolloServer } = require('apollo-server');
const { Schema, Resolver } = require('@coderich/autograph');

module.exports = class Server {
  constructor(gql, stores) {
    const schema = new Schema(gql, stores);
    const executableSchema = schema.makeServerApiSchema();

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
