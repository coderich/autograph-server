const { MongoClient, ObjectID } = require('mongodb');

const toObject = (doc) => {
  if (!doc) return undefined;

  return Object.defineProperty(doc, 'id', {
    get: function get() { return this._id; }, // eslint-disable-line
  });
};

module.exports = class MongoStore {
  constructor(uri) {
    this.connection = MongoClient.connect(uri, { useUnifiedTopology: true });
  }

  query(collection, method, ...args) {
    return this.connection.then(client => client.db().collection(collection)[method](...args));
  }

  get(model, id) {
    return this.query(model, 'findOne', { _id: id }).then(toObject);
  }

  find(model, filter = {}) {
    return this.query(model, 'find', MongoStore.normalizeFilter(filter)).then(results => results.map(toObject).toArray());
  }

  create(model, data) {
    return this.query(model, 'insertOne', data).then(result => toObject(Object.assign(data, { _id: result.insertedId })));
  }

  replace(model, id, doc) {
    return this.query(model, 'replaceOne', { _id: id }, doc).then(() => toObject(doc));
  }

  delete(model, id, doc) {
    return this.query(model, 'deleteOne', { _id: id }).then(() => toObject(doc));
  }

  createIndexes(model, indexes) {
    return Promise.all(indexes.map(({ name, type, fields }) => {
      const $fields = fields.reduce((prev, field) => Object.assign(prev, { [field]: 1 }), {});

      switch (type) {
        case 'unique': return this.query(model, 'createIndex', $fields, { name, unique: true });
        default: return null;
      }
    }));
  }

  static idValue(value) {
    if (value instanceof ObjectID) return value;
    return ObjectID(value);
  }

  static normalizeFilter(filter) {
    return Object.entries(filter).reduce((prev, [key, value]) => {
      return Object.assign(prev, { [key]: MongoStore.normalizeFilterValue(value) });
    }, {});
  }

  static normalizeFilterValue(value) {
    if (Array.isArray(value)) return { $in: value };
    return value;
  }
};
