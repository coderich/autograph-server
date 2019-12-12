const Neo4j = require('neo4j-driver');

const toObject = ({ records }) => {
  return records.map((record) => {
    const node = record.get('n');
    const doc = node.properties;

    return Object.defineProperty(doc, 'id', {
      get: () => node.identity,
    });
  });
};

module.exports = class Neo4jStore {
  constructor(uri, options = {}) {
    this.driver = Neo4j.driver(uri, Neo4j.auth.basic('neo4j', 'helloball'), { disableLosslessIntegers: true });
  }

  get(model, id) {
    return this.driver.session().run(`MATCH (n:${model}) WHERE id(n) = $id RETURN n`, { id }).then(result => toObject(result)[0]);
  }

  find(model, filter = {}) {
    return this.driver.session().run(`MATCH (n:${model}) RETURN n`).then(toObject);
  }

  create(model, data) {
    return this.driver.session().run(`CREATE (n:${model} { ${Object.keys(data).map(k => `${k}:$${k}`)} }) RETURN n`, data).then(result => toObject(result)[0]);
  }

  replace(model, id, doc) {
    return this.driver.session().run(`MATCH (n:${model}) WHERE id(n) = $id SET ${Object.keys(doc).map(k => `n.${k}=$${k}`)} RETURN n`, { id, ...doc }).then(result => toObject(result)[0]);
  }

  delete(model, id, doc) {
    return this.driver.session().run(`MATCH (n:${model}) WHERE id(n) = $id DELETE n`, { id, ...doc }).then(() => doc);
  }

  createIndexes(model, indexes) {
    return Promise.all(indexes.map(({ type, fields }) => {
      switch (type) {
        case 'unique': return this.driver.session().run(`CREATE CONSTRAINT on (n:${model}) ASSERT (${fields.map(f => `n.${f}`).join(',')}) IS UNIQUE`);
        default: return null;
      }
    }));
  }

  static idValue(value) {
    return Number(value);
  }

  // static normalizeFilter(filter) {
  //   return Object.entries(filter).reduce((prev, [key, value]) => {
  //     return Object.assign(prev, { [key]: Neo4jStore.normalizeFilterValue(value) });
  //   }, {});
  // }

  // static normalizeFilterValue(value) {
  //   if (Array.isArray(value)) return { $in: value };
  //   return value;
  // }
};
