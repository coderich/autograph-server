const Hapi = require('@hapi/hapi');
const { ApolloServer, makeExecutableSchema } = require('apollo-server-hapi');
// const Neo4j = require('neodb');
// const Redis = require('redis-mock');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createGraphSchema } = require('../src/service/schema.service');
const { timeout } = require('../src/service/app.service');
const DataLoader = require('../src/core/DataLoader');
const Parser = require('../src/core/Parser');
const Store = require('../src/core/Store');
const Resolver = require('../src/core/Resolver');
const { schema, stores } = require('../schema');
const Client = require('./Client');

let dao;
let richard;
let christie;
let mobyDick;
let healthBook;
let chapter1;
let chapter2;
let page1;
let page2;
let page3;
let page4;
let bookBuilding;
let libraryBuilding;
let apartmentBuilding;
let bookstore1;
let bookstore2;
let library;

const sorter = (a, b) => `${a.id}` - `${b.id}`;

const makeApolloServer = (executableSchema, store, useDataLoader = false) => {
  return new ApolloServer({
    schema: executableSchema,
    context: async ({ request, h }) => ({ store: useDataLoader ? new DataLoader(store) : store }),
  });
};

module.exports = (name, db = 'mongo') => {
  describe(`${name}-${db}`, () => {
    beforeAll(async () => {
      jest.setTimeout(10000);

      const storeArgs = {};

      // Start in-memory db
      switch (db) {
        case 'redis': {
          // const redisClient = Redis.createClient();
          stores.default.type = 'redis';
          // storeArgs.redis = redisClient;
          break;
        }
        case 'neo4j': {
          stores.default.type = 'neo4j';
          stores.default.uri = 'bolt://localhost';
          break;
        }
        case 'neo4jRest': {
          stores.default.type = 'neo4jRest';
          stores.default.uri = 'http://localhost:7474';
          break;
        }
        default: {
          const mongoServer = new MongoMemoryServer();
          stores.default.uri = await mongoServer.getConnectionString();
          break;
        }
      }

      // Create core classes
      const parser = new Parser(schema);
      const store = new Store(parser, stores, storeArgs);
      const resolver = new Resolver();
      const hapiServer = Hapi.server({ port: 3000 });
      const graphSchema = createGraphSchema(parser, resolver);
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

      //
      await timeout(2000);
      await Promise.all(parser.getModelNames().map(model => store.dropModel(model)));
    });


    describe('Create', () => {
      test('Person', async () => {
        richard = await dao.create('Person', { name: 'Richard' });
        expect(richard.id).toBeDefined();
        expect(richard.name).toBe('Richard');

        christie = await dao.create('Person', { name: 'Christie', friends: [richard.id] });
        expect(christie.id).toBeDefined();
        expect(christie.friends).toEqual([richard.id]);
      });

      test('Book', async () => {
        mobyDick = await dao.create('Book', { name: 'moby dick', price: 9.99, author: richard.id });
        expect(mobyDick.id).toBeDefined();
        expect(mobyDick.name).toBe('Moby Dick');
        expect(mobyDick.price).toBe(9.99);
        expect(mobyDick.author).toBe(richard.id);

        healthBook = await dao.create('Book', { name: 'Health and Wellness', price: '29.99', author: christie.id });
        expect(healthBook.id).toBeDefined();
        expect(healthBook.name).toEqual('Health And Wellness');
        expect(healthBook.price).toEqual(29.99);
        expect(healthBook.author).toEqual(christie.id);
      });

      test('Chapter', async () => {
        chapter1 = await dao.create('Chapter', { name: 'chapter1', book: healthBook.id });
        chapter2 = await dao.create('Chapter', { name: 'chapter2', book: healthBook.id });
        expect(chapter1.id).toBeDefined();
        expect(chapter1.name).toEqual('Chapter1');
        expect(chapter2.id).toBeDefined();
        expect(chapter2.name).toEqual('Chapter2');
      });

      test('Page', async () => {
        page1 = await dao.create('Page', { number: 1, chapter: chapter1.id });
        page2 = await dao.create('Page', { number: 2, chapter: chapter1.id });
        page3 = await dao.create('Page', { number: 1, chapter: chapter2.id });
        page4 = await dao.create('Page', { number: 2, chapter: chapter2.id });
        expect(page1.id).toBeDefined();
        expect(page2.id).toBeDefined();
        expect(page3.id).toBeDefined();
        expect(page4.id).toBeDefined();
      });

      test('Building', async () => {
        bookBuilding = await dao.create('Building', { year: 1990, type: 'business' });
        libraryBuilding = await dao.create('Building', { type: 'business' });
        apartmentBuilding = await dao.create('Building', { type: 'home', tenants: [richard.id, christie.id], landlord: richard.id });
        expect(bookBuilding.id).toBeDefined();
        expect(bookBuilding.year).toEqual(1990);
        expect(libraryBuilding.id).toBeDefined();
        expect(apartmentBuilding.id).toBeDefined();
        expect(apartmentBuilding.landlord).toEqual(richard.id);
        expect(apartmentBuilding.tenants).toEqual([richard.id, christie.id]);
      });

      test('BookStore', async () => {
        bookstore1 = await dao.create('BookStore', { name: 'Best Books Ever', books: [mobyDick.id, mobyDick.id, healthBook.id], building: bookBuilding });
        bookstore2 = await dao.create('BookStore', { name: 'New Books', books: [mobyDick.id], building: bookBuilding });
        expect(bookstore1.id).toBeDefined();
        expect(bookstore1.books.length).toEqual(3);
        expect(bookstore1.building.type).toEqual('business');
        expect(bookstore2.id).toBeDefined();
        expect(bookstore2.books.length).toEqual(1);
        expect(bookstore2.building.type).toEqual('business');
      });

      test('Library', async () => {
        library = await dao.create('Library', { name: 'Public Library', books: [mobyDick.id, healthBook.id, healthBook.id], building: libraryBuilding });
        expect(library.id).toBeDefined();
        expect(library.books.length).toEqual(3);
        expect(library.building.type).toEqual('business');
      });
    });


    describe('Get', () => {
      test('Person', async () => {
        expect(await dao.get('Person', richard.id)).toMatchObject({ id: richard.id, name: richard.name });
        expect(await dao.get('Person', christie.id)).toMatchObject({ id: christie.id, name: christie.name, friends: [richard.id] });
      });

      test('Book', async () => {
        expect(await dao.get('Book', mobyDick.id)).toMatchObject({ id: mobyDick.id, name: 'Moby Dick', author: richard.id });
        expect(await dao.get('Book', healthBook.id)).toMatchObject({ id: healthBook.id, name: 'Health And Wellness', author: christie.id });
      });

      test('Chapter', async () => {
        expect(await dao.get('Chapter', chapter1.id)).toMatchObject({ id: chapter1.id, name: 'Chapter1', book: healthBook.id });
        expect(await dao.get('Chapter', chapter2.id)).toMatchObject({ id: chapter2.id, name: 'Chapter2', book: healthBook.id });
      });

      test('Page', async () => {
        expect(await dao.get('Page', page1.id)).toMatchObject({ id: page1.id, number: 1, chapter: chapter1.id });
        expect(await dao.get('Page', page2.id)).toMatchObject({ id: page2.id, number: 2, chapter: chapter1.id });
        expect(await dao.get('Page', page3.id)).toMatchObject({ id: page3.id, number: 1, chapter: chapter2.id });
        expect(await dao.get('Page', page4.id)).toMatchObject({ id: page4.id, number: 2, chapter: chapter2.id });
      });

      test('Building', async () => {
        expect(await dao.get('Building', bookBuilding.id)).toMatchObject({ id: bookBuilding.id, year: 1990, type: 'business' });
        expect(await dao.get('Building', libraryBuilding.id)).toMatchObject({ id: libraryBuilding.id, type: 'business' });
        expect(await dao.get('Building', apartmentBuilding.id)).toMatchObject({ id: apartmentBuilding.id, type: 'home', tenants: [richard.id, christie.id], landlord: richard.id });
      });

      test('BookStore', async () => {
        expect(await dao.get('BookStore', bookstore1.id)).toMatchObject({ id: bookstore1.id, name: 'Best Books Ever', books: [mobyDick.id, mobyDick.id, healthBook.id], building: expect.objectContaining(bookBuilding) });
        expect(await dao.get('BookStore', bookstore2.id)).toMatchObject({ id: bookstore2.id, name: 'New Books', books: [mobyDick.id], building: expect.objectContaining(bookBuilding) });
      });

      test('Library', async () => {
        expect(await dao.get('Library', library.id)).toMatchObject({ id: library.id, name: 'Public Library', books: [mobyDick.id, healthBook.id, healthBook.id], building: expect.objectContaining(libraryBuilding) });
      });
    });


    describe('Find', () => {
      test('Person', async () => {
        expect((await dao.find('Person')).length).toBe(2);
        expect(await dao.find('Person', { name: 'richard' })).toMatchObject([{ id: richard.id, name: 'Richard' }]);
        expect(await dao.find('Person', { name: 'Christie' })).toMatchObject([{ id: christie.id, name: 'Christie' }]);
      });

      test('Book', async () => {
        expect((await dao.find('Book')).length).toBe(2);
        expect(await dao.find('Book', { author: richard.id })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
        expect(await dao.find('Book', { price: 9.99 })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
        expect(await dao.find('Book', { price: '9.99' })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
        expect(await dao.find('Book', { author: christie.id })).toMatchObject([{ id: healthBook.id, name: 'Health And Wellness', author: christie.id }]);
      });

      test('Chapter', async () => {
        expect((await dao.find('Chapter')).length).toBe(2);
        expect(await dao.find('Chapter', { name: 'cHAPter1' })).toMatchObject([{ id: chapter1.id, name: 'Chapter1', book: healthBook.id }]);
        expect(await dao.find('Chapter', { name: 'cHAPteR2' })).toMatchObject([{ id: chapter2.id, name: 'Chapter2', book: healthBook.id }]);
        expect(await dao.find('Chapter', { name: 'cHAPteR3' })).toEqual([]);
        expect(await dao.find('Chapter', { book: mobyDick.id })).toEqual([]);
        // expect(await dao.find('Chapter', { book: 'some-odd-id' })).toEqual([]);
        expect((await dao.find('Chapter', { book: healthBook.id })).sort(sorter)).toMatchObject([
          { id: chapter1.id, name: 'Chapter1', book: healthBook.id },
          { id: chapter2.id, name: 'Chapter2', book: healthBook.id },
        ].sort(sorter));
      });

      test('Page', async () => {
        expect((await dao.find('Page')).length).toBe(4);
        expect((await dao.find('Page', { chapter: chapter1.id })).length).toBe(2);
        expect((await dao.find('Page', { chapter: chapter2.id })).length).toBe(2);
        expect((await dao.find('Page', { number: 1 })).sort(sorter)).toMatchObject([
          { id: page1.id, chapter: chapter1.id },
          { id: page3.id, chapter: chapter2.id },
        ].sort(sorter));
        expect((await dao.find('Page', { number: '2' })).sort(sorter)).toMatchObject([
          { id: page2.id, chapter: chapter1.id },
          { id: page4.id, chapter: chapter2.id },
        ].sort(sorter));
      });

      test('Building', async () => {
        expect((await dao.find('Building')).length).toBe(3);
        expect((await dao.find('Building', { tenants: [richard.id] })).length).toBe(1);
        expect((await dao.find('Building', { tenants: [christie.id] })).length).toBe(1);
        expect((await dao.find('Building', { tenants: [richard.id, christie.id] })).length).toBe(1);
        expect((await dao.find('Building', { tenants: [richard.id, christie.id], landlord: richard.id })).length).toBe(1);
        expect((await dao.find('Building', { tenants: [richard.id, christie.id], landlord: christie.id })).length).toBe(0);
      });

      test('BookStore', async () => {
        expect((await dao.find('BookStore')).length).toBe(2);
        expect((await dao.find('BookStore', { books: [mobyDick.id] })).length).toBe(2);
        expect((await dao.find('BookStore', { name: 'new books' })).sort(sorter)).toMatchObject([
          { id: bookstore2.id, name: 'New Books', building: expect.objectContaining(bookBuilding) },
        ].sort(sorter));
      });

      test('Library', async () => {
        expect((await dao.find('Library')).length).toBe(1);
      });
    });


    describe('Count (find)', () => {
      test('Person', async () => {
        expect(await dao.count('Person')).toBe(2);
        expect(await dao.count('Person', { name: 'richard' })).toBe(1);
        expect(await dao.count('Person', { name: 'Christie' })).toBe(1);
      });

      test('Book', async () => {
        expect(await dao.count('Book')).toBe(2);
        expect(await dao.count('Book', { author: richard.id })).toBe(1);
        expect(await dao.count('Book', { price: 9.99 })).toBe(1);
        expect(await dao.count('Book', { price: '9.99' })).toBe(1);
        expect(await dao.count('Book', { author: christie.id })).toBe(1);
      });

      test('Chapter', async () => {
        expect(await dao.count('Chapter')).toBe(2);
        expect(await dao.count('Chapter', { name: 'cHAPter1' })).toBe(1);
        expect(await dao.count('Chapter', { name: 'cHAPteR2' })).toBe(1);
        expect(await dao.count('Chapter', { name: 'cHAPteR3' })).toBe(0);
        expect(await dao.count('Chapter', { book: mobyDick.id })).toBe(0);
        // expect(await dao.count('Chapter', { book: 'some-odd-id' })).toEqual([]);
        expect(await dao.count('Chapter', { book: healthBook.id })).toBe(2);
      });

      test('Page', async () => {
        expect(await dao.count('Page')).toBe(4);
        expect(await dao.count('Page', { chapter: chapter1.id })).toBe(2);
        expect(await dao.count('Page', { chapter: chapter2.id })).toBe(2);
        expect(await dao.count('Page', { number: 1 })).toBe(2);
        expect(await dao.count('Page', { number: '2' })).toBe(2);
      });

      test('Building', async () => {
        expect(await dao.count('Building')).toBe(3);
        expect(await dao.count('Building', { tenants: [richard.id] })).toBe(1);
        expect(await dao.count('Building', { tenants: [christie.id] })).toBe(1);
        expect(await dao.count('Building', { tenants: [richard.id, christie.id] })).toBe(1);
        expect(await dao.count('Building', { tenants: [richard.id, christie.id], landlord: richard.id })).toBe(1);
        expect(await dao.count('Building', { tenants: [richard.id, christie.id], landlord: christie.id })).toBe(0);
      });

      test('BookStore', async () => {
        expect(await dao.count('BookStore')).toBe(2);
        expect(await dao.count('BookStore', { books: [mobyDick.id] })).toBe(2);
        expect(await dao.count('BookStore', { name: 'new books' })).toBe(1);
      });

      test('Library', async () => {
        expect(await dao.count('Library')).toBe(1);
      });
    });


    describe('Data Validations', () => {
      test('Person', async () => {
        await expect(dao.create('Person')).rejects.toThrow();
        await expect(dao.create('Person', { name: 'Richard' })).rejects.toThrow();
        await expect(dao.create('Person', { name: 'NewGuy', friends: ['nobody'] })).rejects.toThrow();
        await expect(dao.create('Person', { name: 'NewGuy', friends: [richard.id, 'nobody'] })).rejects.toThrow();
        await expect(dao.update('Person', richard.id, { name: 'Christie' })).rejects.toThrow();
        await expect(dao.update('Person', richard.id, { name: 'christie' })).rejects.toThrow();
        await expect(dao.update('Person', richard.id, { name: null })).rejects.toThrow();
        await expect(dao.update('Person', 'nobody', { name: 'NewGuy' })).rejects.toThrow();
      });

      test('Book', async () => {
        await expect(dao.create('Book')).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible' })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible', author: 'Moses' })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible', author: richard.id })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible', price: 1.99 })).rejects.toThrow();
        // await expect(dao.create('Book', { name: 'MoBY DiCK', price: 1.99, author: richard.id })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible', price: 1.99, author: mobyDick.id })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'The Bible', price: 1.99, author: [christie.id] })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'Great Book', price: -1, author: christie.id })).rejects.toThrow();
        await expect(dao.create('Book', { name: 'Best Book', price: 101, author: christie.id })).rejects.toThrow();
        await expect(dao.update('Book', mobyDick.id, { author: christie.id })).rejects.toThrow();
        // await expect(dao.update('Book', mobyDick.id, { author: richard.id })).resolves!!!;
      });

      test('Chapter', async () => {
        await expect(dao.create('Chapter')).rejects.toThrow();
        await expect(dao.create('Chapter', { name: 'chapter1' })).rejects.toThrow();
        await expect(dao.create('Chapter', { name: 'chapter2' })).rejects.toThrow();
        await expect(dao.create('Chapter', { name: 'chapter3' })).rejects.toThrow();
        // await expect(dao.create('Chapter', { name: 'chapter1', book: healthBook.id })).rejects.toThrow();
        // await expect(dao.create('Chapter', { name: 'chapter3', book: christie.id })).rejects.toThrow();
      });

      test('Page', async () => {
        await expect(dao.create('Page')).rejects.toThrow();
        await expect(dao.create('Page', { number: 3 })).rejects.toThrow();
        // await expect(dao.create('Page', { number: 1, chapter: chapter1 })).rejects.toThrow();
        // await expect(dao.create('Page', { number: 1, chapter: chapter1.id })).rejects.toThrow();
        // await expect(dao.create('Page', { number: 1, chapter: page4.id })).rejects.toThrow();
        // await expect(dao.update('Page', page1.id, { number: 2 })).rejects.toThrow();
      });

      test('Building', async () => {
        await expect(dao.create('Building')).rejects.toThrow();
        await expect(dao.create('Building', { type: 'bad-type' })).rejects.toThrow();
        await expect(dao.create('Building', { type: 'business', landlord: bookstore1.id })).rejects.toThrow();
        await expect(dao.create('Building', { type: 'business', tenants: richard.id })).rejects.toThrow();
        await expect(dao.create('Building', { type: 'business', tenants: [richard.id, bookstore1.id] })).rejects.toThrow();
      });

      // test('BookStore', async () => {
      //   await expect(dao.create('BookStore')).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'New Books' })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'New Books', building: 'bad-building' })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'besT bookS eveR', building })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'Best Books Ever', building: library })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'More More Books', building, books: building.id })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'More More Books', building, books: [building.id] })).rejects.toThrow();
      //   await expect(dao.create('BookStore', { name: 'More More Books', building, books: [mobyDick.id, building] })).rejects.toThrow();
      // });

      test('Library', async () => {
        await expect(dao.create('Library')).rejects.toThrow();
        await expect(dao.create('Library', { name: 'New Library' })).rejects.toThrow();
        await expect(dao.create('Library', { name: 'New Library', building: 'bad-building' })).rejects.toThrow();
        await expect(dao.create('Library', { name: 'New Library', building: libraryBuilding })).rejects.toThrow();
      });
    });

    // describe('Search', () => {
    //   test('Person', async () => {
    //     expect((await dao.search('Person')).length).toBe(2);
    //     expect(await dao.search('Person', { name: 'richard' })).toMatchObject([{ id: richard.id, name: 'Richard' }]);
    //     expect(await dao.search('Person', { name: 'Christie' })).toMatchObject([{ id: christie.id, name: 'Christie' }]);
    //   });

    //   test('Book', async () => {
    //     expect((await dao.search('Book')).length).toBe(2);
    //     expect(await dao.search('Book', { author: richard.id })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
    //     expect(await dao.search('Book', { price: 9.99 })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
    //     expect(await dao.search('Book', { price: '9.99' })).toMatchObject([{ id: mobyDick.id, name: 'Moby Dick', author: richard.id }]);
    //     expect(await dao.search('Book', { author: christie.id })).toMatchObject([{ id: healthBook.id, name: 'Health And Wellness', author: christie.id }]);
    //   });

    //   // test('Chapter', async () => {
    //   //   expect((await dao.find('Chapter')).length).toBe(2);
    //   //   expect(await dao.find('Chapter', { name: 'cHAPter1' })).toMatchObject([{ id: chapter1.id, name: 'Chapter1', book: healthBook.id }]);
    //   //   expect(await dao.find('Chapter', { name: 'cHAPteR2' })).toMatchObject([{ id: chapter2.id, name: 'Chapter2', book: healthBook.id }]);
    //   //   expect(await dao.find('Chapter', { name: 'cHAPteR3' })).toEqual([]);
    //   //   expect(await dao.find('Chapter', { book: mobyDick.id })).toEqual([]);
    //   //   // expect(await dao.find('Chapter', { book: 'some-odd-id' })).toEqual([]);
    //   //   expect((await dao.find('Chapter', { book: healthBook.id })).sort(sorter)).toMatchObject([
    //   //     { id: chapter1.id, name: 'Chapter1', book: healthBook.id },
    //   //     { id: chapter2.id, name: 'Chapter2', book: healthBook.id },
    //   //   ].sort(sorter));
    //   // });

    //   // test('Page', async () => {
    //   //   expect((await dao.find('Page')).length).toBe(4);
    //   //   expect((await dao.find('Page', { chapter: chapter1.id })).length).toBe(2);
    //   //   expect((await dao.find('Page', { chapter: chapter2.id })).length).toBe(2);
    //   //   expect((await dao.find('Page', { number: 1 })).sort(sorter)).toMatchObject([
    //   //     { id: page1.id, chapter: chapter1.id },
    //   //     { id: page3.id, chapter: chapter2.id },
    //   //   ].sort(sorter));
    //   //   expect((await dao.find('Page', { number: '2' })).sort(sorter)).toMatchObject([
    //   //     { id: page2.id, chapter: chapter1.id },
    //   //     { id: page4.id, chapter: chapter2.id },
    //   //   ].sort(sorter));
    //   // });

    //   // test('Building', async () => {
    //   //   expect((await dao.find('Building')).length).toBe(3);
    //   //   expect((await dao.find('Building', { tenants: [richard.id] })).length).toBe(1);
    //   //   expect((await dao.find('Building', { tenants: [christie.id] })).length).toBe(1);
    //   //   expect((await dao.find('Building', { tenants: [richard.id, christie.id] })).length).toBe(1);
    //   //   expect((await dao.find('Building', { tenants: [richard.id, christie.id], landlord: richard.id })).length).toBe(1);
    //   //   expect((await dao.find('Building', { tenants: [richard.id, christie.id], landlord: christie.id })).length).toBe(0);
    //   // });

    //   // test('BookStore', async () => {
    //   //   expect((await dao.find('BookStore')).length).toBe(2);
    //   //   expect((await dao.find('BookStore', { books: [mobyDick.id] })).length).toBe(2);
    //   //   expect((await dao.find('BookStore', { name: 'new books' })).sort(sorter)).toMatchObject([
    //   //     { id: bookstore2.id, name: 'New Books', building: expect.objectContaining(bookBuilding) },
    //   //   ].sort(sorter));
    //   // });

    //   // test('Library', async () => {
    //   //   expect((await dao.find('Library')).length).toBe(1);
    //   // });
    // });


    // test('PersonSchema', async () => {
    //   // Data Normalization
    //   richard = await dao.update('Person', richard.id, { name: 'rich', friends: [christie.id, christie.id, christie.id] });
    //   expect(richard.name).toEqual('Rich');
    //   expect(richard.friends).toEqual([christie.id]);
    // });
  });
};
