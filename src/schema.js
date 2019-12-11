exports.schema = {
  Person: {
    fields: {
      name: { type: String, required: true },
      books: { type: ['Book'], by: 'author' },
      friends: { type: ['Person'], unique: true, onDelete: 'cascade' },
    },
    indexes: [
      { name: 'uix_person_name', type: 'unique', fields: ['name'] },
    ],
  },
  Book: {
    fields: {
      name: { type: String, required: true },
      price: { type: Number, required: true },
      author: { type: 'Person', onDelete: 'cascade', required: true, immutable: true },
      chapters: { type: ['Chapter'], by: 'book' },
    },
    indexes: [
      { name: 'uix_book', type: 'unique', fields: ['name', 'author'] },
    ],
  },
  Chapter: {
    fields: {
      name: String,
      book: { type: 'Book', required: true },
      pages: { type: ['Page'], by: 'chapter' },
    },
  },
  Page: {
    fields: {
      number: Number,
      verbage: { type: String, alias: ['description'] },
      chapter: { type: 'Chapter', required: true },
    },
  },
  Library: {
    fields: {
      name: String,
      type: { type: String, enum: ['public', 'private'], required: true },
      location: String,
      configurations: { type: ['Configuration'], embedded: true },
      books: { type: ['Book'], unique: true, onDelete: 'cascade' },
    },
  },
  Configuration: {
    hideFromApi: true,
    fields: {
      url: { type: String, required: true },
      pages: { type: ['Page'] },
    },
  },
  Network: {
    store: 'gozio',
    alias: 'networks',
    fields: {
      name: { type: String, required: true },
      humanName: { alias: 'human_name', type: String, required: true },
      placeholder: { type: ['NetworkPlaceholder'], by: 'network' },
    },
  },
  NetworkPlaceholder: {
    store: 'gozio',
    alias: 'network_placeholder',
    fields: {
      network: { alias: 'network_id', type: 'Network', required: true },
      type: { type: String, required: true },
    },
  },
  User: {
    store: 'neo4j',
    alias: 'user',
    idType: Number,
    fields: {
      firstName: String,
      lastName: String,
      emailAddress: String,
    },
  },
};

exports.actions = {

};

exports.stores = {
  default: {
    type: 'mongo',
    uri: 'mongodb://localhost:27017/graphql',
  },
  gozio: {
    type: 'mongo',
    uri: 'mongodb://localhost:27017/meteor',
  },
  neo4j: {
    type: 'neo4j',
    uri: 'bolt://localhost',
    user: 'neo4j',
    pass: 'helloball',
  },
};
