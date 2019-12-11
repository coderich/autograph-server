module.exports = {
  schema: {
    Person: {
      // id: 'Person',
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
      // id: 'Book',
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
      // id: 'Chapter',
      fields: {
        name: String,
        book: { type: 'Book', required: true },
        pages: { type: ['Page'], by: 'chapter' },
      },
    },
    Page: {
      // id: 'Page',
      fields: {
        number: Number,
        verbage: { type: String, alias: ['description'] },
        chapter: { type: 'Chapter', required: true },
      },
    },
    Library: {
      // id: 'Library',
      fields: {
        name: String,
        type: { type: String, enum: ['public', 'private'], required: true },
        location: String,
        configurations: { type: ['Configuration'], embedded: true },
        books: { type: ['Book'], unique: true, onDelete: 'cascade' },
      },
    },
    Network: {
      // id: 'Network',
      fields: {
        configuration: { type: 'Configuration', embedded: true },
      },
    },
    Configuration: {
      // id: 'Configuration',
      hideFromApi: true,
      fields: {
        url: { type: String, required: true },
        pages: { type: ['Page'] },
      },
    },
  },
  stores: {
    default: {
      type: 'mongo',
      uri: 'mongodb://localhost:27017/graphql',
    },
  },
};
