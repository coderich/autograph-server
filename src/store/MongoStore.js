const PicoMatch = require('picomatch');
const { MongoClient, ObjectID } = require('mongodb');
const Parser = require('../core/Parser');
const { proxyDeep, isScalarValue } = require('../service/app.service');

const toObject = (doc) => {
  if (!doc) return undefined;

  return Object.defineProperty(doc, 'id', {
    get() { return this._id; }, // eslint-disable-line
  });
};

module.exports = class MongoStore {
  constructor(uri, parser) {
    this.parser = parser;
    this.connection = MongoClient.connect(uri, { useUnifiedTopology: true });
  }

  query(collection, method, ...args) {
    return this.connection.then(client => client.db().collection(collection)[method](...args));
  }

  get(model, id) {
    return this.query(model, 'findOne', { _id: id }).then(toObject);
  }

  find(model, where = {}) {
    const $where = MongoStore.normalizeWhereClause(model, this.parser, where);
    return this.query(model, 'aggregate', $where).then(results => results.map(toObject).toArray());
  }

  count(model, where = {}) {
    const $where = MongoStore.normalizeWhereClause(model, this.parser, where, true);
    return this.query(model, 'aggregate', $where).then(cursor => cursor.next().then(data => (data ? data.count : 0)));
  }

  create(model, data) {
    return this.query(model, 'insertOne', data).then(result => toObject(Object.assign(data, { _id: result.insertedId })));
  }

  replace(model, id, data, doc) {
    return this.query(model, 'replaceOne', { _id: id }, doc).then(() => toObject(doc));
  }

  delete(model, id, doc) {
    return this.query(model, 'deleteOne', { _id: id }).then(() => doc);
  }

  dropModel(model) {
    return this.query(model, 'deleteMany');
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

  static normalizeWhereClause(model, parser, where, count = false) {
    const $match = proxyDeep(where, {
      get(target, prop, rec) {
        const value = Reflect.get(target, prop, rec);
        if (Array.isArray(value)) return { $in: value };
        if (typeof value === 'function') return value.bind(target);
        if (typeof value === 'string') return PicoMatch.makeRe(value, { nocase: true, regex: true, unescape: true, maxLength: 100 });
        return value;
      },
    }).toObject();

    const $agg = [];

    const fields = Object.entries(parser.getModelFields(model)).filter(([name, def]) => {
      const val = where[name];
      const type = Parser.getFieldDataType(def);
      if (!Parser.isScalarValue(type)) return false;
      const stype = String((type === 'Float' ? 'Number' : type)).toLowerCase();
      if (String(typeof val) === `${stype}`) return false;
      return true;
    }).map(([name]) => name);

    const $addFields = fields.reduce((prev, key) => Object.assign(prev, { [key]: { $toString: `$${key}` } }), {});
    if (Object.keys($addFields).length) $agg.push({ $addFields });
    $agg.push({ $match });
    if (count) $agg.push({ $count: 'count' });
    return $agg;
  }
};
