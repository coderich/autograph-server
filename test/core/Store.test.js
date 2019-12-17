const { MongoMemoryServer } = require('mongodb-memory-server');
const Parser = require('../../src/core/Parser');
const Store = require('../../src/core/Store');
const { schema, stores } = require('../../schema');

let store;
let richard;
let christie;

describe('Store', () => {
  beforeAll(async () => {
    jest.setTimeout(20000);

    // Start mongo memory server
    global.mongoServer = new MongoMemoryServer();
    stores.default.uri = await global.mongoServer.getConnectionString();

    // Create core classes
    const parser = new Parser(schema);
    store = new Store(parser, stores);
  });

  test('PersonSchema', async () => {
    // Richard
    richard = await store.create('Person', { name: 'Richard' });
    expect(richard.id).toBeDefined();
    expect(richard.name).toBe('Richard');

    // Christie
    christie = await store.create('Person', { name: 'Christie', friends: [richard.id] });
    expect(christie.id).toBeDefined();
    expect(christie.friends).toEqual([richard.id]);

    // Integrity Constriants
    await expect(store.create('Person')).rejects.toThrow();
    await expect(store.create('Person', { name: 'Richard' })).rejects.toThrow();
    await expect(store.create('Person', { name: 'NewGuy', friends: ['nobody'] })).rejects.toThrow();
    await expect(store.create('Person', { name: 'NewGuy', friends: [richard.id, 'nobody'] })).rejects.toThrow();
    await expect(store.update('Person', richard.id, { name: 'Christie' })).rejects.toThrow();
    await expect(store.update('Person', richard.id, { name: 'christie' })).rejects.toThrow();
    await expect(store.update('Person', richard.id, { name: null })).rejects.toThrow();

    // Data Normalization
    richard = await store.update('Person', richard.id, { name: 'rich', friends: [christie.id, christie.id, christie.id] });
    expect(richard.name).toEqual('Rich');
    expect(richard.friends).toEqual([christie.id]);
  });

  test('BookSchema', async () => {
    const mobyDick = await store.create('Book', { name: 'moby dick', price: 9.99, author: richard.id });
    expect(mobyDick.id).toBeDefined();
    expect(mobyDick.name).toBe('Moby Dick');
    expect(mobyDick.price).toBe(9.99);
    expect(mobyDick.author).toBe(richard.id);

    const healthBook = await store.create('Book', { name: 'Health and Wellness', price: 29.99, author: christie.id });
    expect(healthBook.id).toBeDefined();
    expect(healthBook.name).toEqual('Health And Wellness');
    expect(healthBook.price).toEqual(29.99);
    expect(healthBook.author).toEqual(christie.id);

    // Integrity Constriants
    await expect(store.create('Book')).rejects.toThrow();
    await expect(store.create('Book', { name: 'The Bible' })).rejects.toThrow();
    await expect(store.create('Book', { name: 'The Bible', author: 'Moses' })).rejects.toThrow();
    await expect(store.create('Book', { name: 'The Bible', author: richard.id })).rejects.toThrow();
    await expect(store.create('Book', { name: 'The Bible', price: 1.99 })).rejects.toThrow();
  });
});
