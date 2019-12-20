const { required, immutable, range, allow, reject, email } = require('./src/service/rule.service');

exports.schema = {
  Person: {
    fields: {
      name: { type: String, case: 'title', rules: [required()] },
      emailAddress: { type: String, rules: [required(), email()] },
      authored: { type: ['Book'], by: 'author' },
      friends: { type: ['Person'], unique: true, onDelete: 'cascade' },
    },
    indexes: [
      { name: 'uix_person_name', type: 'unique', fields: ['name'] },
    ],
  },
  Book: {
    fields: {
      name: { type: String, case: 'title', rules: [required(), reject('The Bible')] },
      price: { type: Number, rules: [range(0, 100), required()] },
      author: { type: 'Person', onDelete: 'cascade', rules: [required(), immutable()] },
      bestSeller: Boolean,
      chapters: { type: ['Chapter'], by: 'book' },
    },
    indexes: [
      { name: 'uix_book', type: 'unique', fields: ['name', 'author'] },
    ],
  },
  Chapter: {
    fields: {
      name: { type: String, case: 'title', rules: [required()] },
      book: { type: 'Book', rules: [required()] },
      pages: { type: ['Page'], by: 'chapter' },
    },
    indexes: [
      { name: 'uix_chapter', type: 'unique', fields: ['name', 'book'] },
    ],
  },
  Page: {
    fields: {
      number: { type: Number, min: 1, rules: [required(), range(1)] },
      verbage: String,
      chapter: { type: 'Chapter', rules: [required()] },
    },
    indexes: [
      { name: 'uix_page', type: 'unique', fields: ['number', 'chapter'] },
    ],
  },
  BookStore: {
    fields: {
      name: { type: String, case: 'title', rules: [required()] },
      location: String,
      books: { type: ['Book'], onDelete: 'cascade' },
      building: { type: 'Building', embedded: true, onDelete: 'cascade', rules: [required()] },
    },
    indexes: [
      { name: 'uix_bookstore', type: 'unique', fields: ['name'] },
    ],
  },
  Library: {
    fields: {
      name: { type: String, case: 'title', rules: [required()] },
      location: String,
      books: { type: ['Book'], onDelete: 'cascade' },
      building: { type: 'Building', embedded: true, onDelete: 'cascade', rules: [required()] },
    },
    indexes: [
      { name: 'uix_libraay', type: 'unique', fields: ['name'] },
      { name: 'uix_library_bulding', type: 'unique', fields: ['building'] },
    ],
  },
  Building: {
    hideFromApi: true,
    fields: {
      year: Number,
      type: { type: String, rules: [required(), allow('home', 'office', 'business')] },
      tenants: { type: ['Person'], unique: true, onDelete: 'cascade' },
      landlord: 'Person',
    },
  },
};

exports.stores = {
  default: {
    type: 'mongo',
    uri: 'mongodb://localhost:27017/autograph',
  },
};
