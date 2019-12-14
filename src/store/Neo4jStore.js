const Neo4j = require('neo4j-driver');
const MicroMatch = require('micromatch');
const { proxyDeep } = require('../service/app.service');

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

  find(model, where = {}) {
    const $where = Neo4jStore.normalizeWhereClause(where);
    return this.driver.session().run(`MATCH (n:${model}) WHERE ${$where} RETURN n`).then(toObject);
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

  static normalizeWhereClause(where) {
    const obj = proxyDeep(where, {
      get(target, prop, rec) {
        const value = Reflect.get(target, prop, rec);
        if (typeof value === 'function') return value.bind(target);
        if (Array.isArray(value)) return `n.${prop} IN [${value.join(',')}]`;
        if (typeof value === 'string') return `n.${prop} =~ '(?i)${MicroMatch.makeRe(value, { unescape: true, regex: true, maxLength: 100 }).toString().slice(1, -1).replace(/\\/g, '\\\\')}'`;
        return `n.${prop} = ${value}`;
      },
    }).toObject();

    return Object.values(obj).join(' AND ');
  }
};
