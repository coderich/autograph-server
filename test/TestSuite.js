const Hapi = require('@hapi/hapi');
const { ApolloServer, makeExecutableSchema } = require('apollo-server-hapi');
const { MongoMemoryServer } = require('mongodb-memory-server');
const SchemaService = require('../src/service/schema.service');
const DataLoader = require('../src/core/DataLoader');
const Parser = require('../src/core/Parser');
const Store = require('../src/core/Store');
const Resolver = require('../src/core/Resolver');
const { schema, stores } = require('../schema');
const Client = require('./Client');

let dao;
let richard;
let christie;

const makeApolloServer = (executableSchema, store, useDataLoader = false) => {
  return new ApolloServer({
    schema: executableSchema,
    context: async ({ request, h }) => ({ store: useDataLoader ? new DataLoader(store) : store }),
  });
};

module.exports = (name) => {
  describe(name, () => {
    beforeAll(async () => {
      jest.setTimeout(20000);

      // Start mongo memory server
      global.mongoServer = new MongoMemoryServer();
      stores.default.uri = await global.mongoServer.getConnectionString();

      // Create core classes
      const parser = new Parser(schema);
      const store = new Store(parser, stores);
      const resolver = new Resolver();
      const hapiServer = Hapi.server({ port: 3000 });
      const graphSchema = SchemaService.createGraphSchema(parser, resolver);
      const executableSchema = makeExecutableSchema(graphSchema);

      //
      switch (name) {
        case 'Store': {
          dao = store;
          break;
        }
        case 'DataLoader': {
          dao = new DataLoader(store);
          break;
        }
        case 'Resolver': {
          dao = new Client(parser, 'http://localhost:3000/graphql');
          const apolloServer = makeApolloServer(executableSchema, store, Boolean(name === 'DataLoader'));
          apolloServer.applyMiddleware({ app: hapiServer });
          await hapiServer.start();
          break;
        }
        default: {
          dao = store;
          break;
        }
      }
    });

    test('PersonSchema', async () => {
      // Richard
      richard = await dao.create('Person', { name: 'Richard' });
      expect(richard.id).toBeDefined();
      expect(richard.name).toBe('Richard');

      // Christie
      christie = await dao.create('Person', { name: 'Christie', friends: [richard.id] });
      expect(christie.id).toBeDefined();
      expect(christie.friends).toEqual([richard.id]);

      // Integrity Constriants
      await expect(dao.create('Person')).rejects.toThrow();
      await expect(dao.create('Person', { name: 'Richard' })).rejects.toThrow();
      await expect(dao.create('Person', { name: 'NewGuy', friends: ['nobody'] })).rejects.toThrow();
      await expect(dao.create('Person', { name: 'NewGuy', friends: [richard.id, 'nobody'] })).rejects.toThrow();
      await expect(dao.update('Person', richard.id, { name: 'Christie' })).rejects.toThrow();
      await expect(dao.update('Person', richard.id, { name: 'christie' })).rejects.toThrow();
      await expect(dao.update('Person', richard.id, { name: null })).rejects.toThrow();
      await expect(dao.update('Person', 'nobody', { name: 'NewGuy' })).rejects.toThrow();

      // Data Normalization
      richard = await dao.update('Person', richard.id, { name: 'rich', friends: [christie.id, christie.id, christie.id] });
      expect(richard.name).toEqual('Rich');
      expect(richard.friends).toEqual([christie.id]);
    });

    test('BookSchema', async () => {
      const mobyDick = await dao.create('Book', { name: 'moby dick', price: 9.99, author: richard.id });
      expect(mobyDick.id).toBeDefined();
      expect(mobyDick.name).toBe('Moby Dick');
      expect(mobyDick.price).toBe(9.99);
      expect(mobyDick.author).toBe(richard.id);

      const healthBook = await dao.create('Book', { name: 'Health and Wellness', price: 29.99, author: christie.id });
      expect(healthBook.id).toBeDefined();
      expect(healthBook.name).toEqual('Health And Wellness');
      expect(healthBook.price).toEqual(29.99);
      expect(healthBook.author).toEqual(christie.id);

      // Integrity Constriants
      await expect(dao.create('Book')).rejects.toThrow();
      await expect(dao.create('Book', { name: 'The Bible' })).rejects.toThrow();
      await expect(dao.create('Book', { name: 'The Bible', author: 'Moses' })).rejects.toThrow();
      await expect(dao.create('Book', { name: 'The Bible', author: richard.id })).rejects.toThrow();
      await expect(dao.create('Book', { name: 'The Bible', price: 1.99 })).rejects.toThrow();
      await expect(dao.create('Book', { name: 'MoBY DiCK', price: 1.99, author: richard.id })).rejects.toThrow();
      await expect(dao.create('Book', { name: 'The Bible', price: 1.99, author: mobyDick.id })).rejects.toThrow();
      await expect(dao.update('Book', mobyDick.id, { author: christie.id })).rejects.toThrow();
      // await expect(dao.update('Book', mobyDick.id, { author: richard.id })).resolves!!!;
      // await expect(dao.create('Book', { name: 'Great Book', price: -1, author: christie.id })).rejects.toThrow();
      // await expect(dao.create('Book', { name: 'Best Book', price: 101, author: christie.id })).rejects.toThrow();
    });

    test('ChapterSchema', async () => {
      const [mobyDick, healthBook] = await dao.find('Book');
      expect(mobyDick.author).toEqual(richard.id);
      expect(healthBook.author).toEqual(christie.id);

      const chapter1 = await dao.create('Chapter', { name: 'chapter1', book: healthBook.id });
      const chapter2 = await dao.create('Chapter', { name: 'chapter2', book: healthBook.id });
      expect(chapter1.id).toBeDefined();
      expect(chapter2.id).toBeDefined();

      // Integrity Constriants
      await expect(dao.create('Chapter')).rejects.toThrow();
      await expect(dao.create('Chapter', { name: 'chapter1' })).rejects.toThrow();
      await expect(dao.create('Chapter', { name: 'chapter2' })).rejects.toThrow();
      await expect(dao.create('Chapter', { name: 'chapter3' })).rejects.toThrow();
      await expect(dao.create('Chapter', { name: 'chapter1', book: healthBook.id })).rejects.toThrow();
      await expect(dao.create('Chapter', { name: 'chapter3', book: christie.id })).rejects.toThrow();
    });
  });
};
