const Axios = require('axios');
const Neo4j = require('neo4j-driver');
const PicoMatch = require('picomatch');
const { proxyDeep, isScalarValue } = require('../service/app.service');

class Cypher {
  constructor(uri, parser, options = {}) {
    this.uri = uri;
    this.parser = parser;
    this.options = options;
  }

  get(model, id) {
    return this.query(`MATCH (n:${model}) WHERE n.id = { id } RETURN n`, { id }).then(docs => docs[0]);
  }

  find(model, where = {}) {
    const { $where, $params } = Cypher.normalizeWhereClause(where);
    const $wherePart = $where ? `WHERE ${$where}` : '';
    return this.query(`MATCH (n:${model}) ${$wherePart} RETURN n`, $params);
  }

  count(model, where = {}) {
    const { $where, $params } = Cypher.normalizeWhereClause(where);
    const $wherePart = $where ? `WHERE ${$where}` : '';
    return this.query(`MATCH (n:${model}) ${$wherePart} RETURN count(n) AS n`, $params).then(counts => counts[0]);
  }

  create(model, data) {
    return this.query(`CREATE (n:${model} { ${Object.keys(data).map(k => `${k}:{${k}}`)} }) SET n.id = id(n) RETURN n`, data).then(docs => docs[0]);
  }

  replace(model, id, data, doc) {
    return this.query(`MATCH (n:${model}) WHERE n.id = { id } SET ${Object.keys(doc).map(k => `n.${k}={${k}}`)} RETURN n`, { id, ...doc }).then(docs => docs[0]);
  }

  delete(model, id, doc) {
    return this.query(`MATCH (n:${model}) WHERE n.id = { id } DELETE n`, { id }).then(() => doc);
  }

  dropModel(model) {
    return this.query(`MATCH (n:${model}) DELETE n`);
  }

  createIndexes(model, indexes) {
    return Promise.all(indexes.map(({ type, fields }) => {
      if (fields.length > 1) return null;

      switch (type) {
        case 'unique': return this.query(`CREATE CONSTRAINT on (n:${model}) ASSERT (${fields.map(f => `n.${f}`).join(',')}) IS UNIQUE`);
        default: return null;
      }
    }));
  }

  static idValue(value) {
    return Number(value);
  }

  static normalizeWhereClause(where) {
    const $params = {};

    const obj = proxyDeep(where, {
      get(target, prop, rec) {
        const value = Reflect.get(target, prop, rec);
        if (typeof value === 'function') return value.bind(target);

        if (Array.isArray(value)) {
          $params[prop] = value;
          return `any (x IN n.${prop} WHERE x IN $${prop})`;
        }

        if (typeof value === 'string') {
          $params[prop] = `(?i)${PicoMatch.makeRe(value, { unescape: true, regex: true, maxLength: 100 }).toString().slice(1, -1)}`;
          return `toString(n.${prop}) =~ $${prop}`;
        }

        $params[prop] = value;
        return `n.${prop} = $${prop}`;
      },
    }).toObject();

    return {
      $where: Object.values(obj).join(' AND '),
      $params,
    };
  }

  static serialize(data) {
    return proxyDeep(data, {
      get(target, prop, rec) {
        const value = Reflect.get(target, prop, rec);
        if (typeof value === 'function') return value.bind(target);
        if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
        return value;
      },
    }).toObject();
  }

  static deserialize(data) {
    return proxyDeep(data, {
      get(target, prop, rec) {
        const value = Reflect.get(target, prop, rec);
        if (typeof value === 'function') return value.bind(target);

        if (typeof value === 'string') {
          try {
            const val = JSON.parse(value);
            return val;
          } catch (e) {
            return value;
          }
        }

        return value;
      },
    }).toObject();
  }
}

exports.Neo4jRest = class Neo4jRest extends Cypher {
  constructor(uri, options) {
    super(uri, options);
    this.cypher = Axios.get(`${uri}/db/data/`).then(({ data }) => data.cypher);
  }

  query(query, params = {}) {
    return this.cypher.then(url => Axios.post(url, { query, params: Neo4jRest.serialize(params) }).then(({ data }) => Neo4jRest.toObject(data.data || [])));
  }

  static toObject(records) {
    return records.map(([result]) => {
      if (isScalarValue(result)) return result;

      const { metadata, data } = result;
      return Object.defineProperty(Neo4jRest.deserialize(data), 'id', {
        get: () => metadata.id,
      });
    });
  }
};

exports.Neo4jDriver = class Neo4jDriver extends Cypher {
  constructor(uri, options) {
    super(uri, options);
    this.driver = Neo4j.driver(uri, null, { disableLosslessIntegers: true });
  }

  query(query, params = {}) {
    return this.driver.session().run(query, Neo4jDriver.serialize(params)).then(Neo4jDriver.toObject);
  }

  static toObject({ records }) {
    return records.map((record) => {
      const node = record.get('n');
      if (isScalarValue(node)) return node;

      const doc = node.properties;
      return Object.defineProperty(Neo4jDriver.deserialize(doc), 'id', {
        get: () => node.identity,
      });
    });
  }
};
