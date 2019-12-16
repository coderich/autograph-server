exports.schema = {
  Person: {
    fields: {
      name: { type: String, required: true },
      authored: { type: ['Book'], by: 'author' },
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
    indexes: [
      { name: 'uix_chapter', type: 'unique', fields: ['name', 'book'] },
    ],
  },
  Page: {
    fields: {
      number: Number,
      verbage: String,
      chapter: { type: 'Chapter', required: true },
    },
    indexes: [
      { name: 'uix_page', type: 'unique', fields: ['number', 'chapter'] },
    ],
  },
  BookStore: {
    fields: {
      name: { type: String, required: true },
      location: String,
      books: { type: ['Book'], unique: true, onDelete: 'cascade' },
      building: { type: 'Building', required: true, embedded: true, onDelete: 'cascade' },
    },
    indexes: [
      { name: 'uix_bookstore', type: 'unique', fields: ['name'] },
    ],
  },
  Library: {
    fields: {
      name: { type: String, required: true },
      location: String,
      books: { type: ['Book'], unique: true, onDelete: 'cascade' },
      building: { type: 'Building', required: true, embedded: true, onDelete: 'cascade' },
    },
    indexes: [
      { name: 'uix_libraary', type: 'unique', fields: ['name'] },
    ],
  },
  Building: {
    hideFromApi: true,
    fields: {
      year: Number,
      type: { type: String, enum: ['home', 'office', 'business'], required: true },
      tenants: { type: ['Person'], unique: true, onDelete: 'cascade' },
      landlord: 'Person',
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
};
