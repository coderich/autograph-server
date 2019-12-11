const { MongoClient, ObjectID } = require('mongodb');

module.exports = class MongoStore {
  constructor(uri) {
    this.connection = MongoClient.connect(uri, { useUnifiedTopology: true });
  }

  query(collection, method, ...args) {
    return this.connection.then(client => client.db().collection(collection)[method](...args));
  }

  get(model, id) {
    return this.query(model, 'findOne', { _id: ObjectID(id) }).then(MongoStore.idDoc);
  }

  find(model, filter = {}) {
    return this.query(model, 'find', MongoStore.normalizeFilter(filter)).then(results => results.map(MongoStore.idDoc).toArray());
  }

  create(model, data) {
    return this.query(model, 'insertOne', data).then(result => MongoStore.idDoc(Object.assign(data, { _id: result.insertedId })));
  }

  replace(model, id, doc) {
    return this.query(model, 'replaceOne', { _id: ObjectID(id) }, doc).then(() => MongoStore.idDoc(doc));
  }

  delete(model, id, doc) {
    return this.query(model, 'deleteOne', { _id: ObjectID(id) }).then(result => MongoStore.idDoc(doc));
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

  static idDoc(doc) {
    if (!doc) return undefined;
    return Object.assign(doc, { id: doc._id }); // eslint-disable-line
  }
};
