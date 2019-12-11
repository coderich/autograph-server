// https://oss.redislabs.com/redisjson/commands

const Redis = require('redis');
const AppService = require('../service/app.service');

Redis.addCommand('json.get');
Redis.addCommand('json.mget');
Redis.addCommand('json.set');
Redis.addCommand('json.del');
Redis.addCommand('json.arrpop');
Redis.addCommand('json.arrindex');
Redis.addCommand('json.arrinsert');
Redis.addCommand('json.arrappend');
Redis.addCommand('json.numincrby');

const client = Redis.createClient();

const toPromise = (caller, fn, ...args) => {
  return new Promise((resolve, reject) => {
    caller[fn](...args, (err, result) => {
      if (err) return reject(err);

      try {
        const results = Array.isArray(result) ? result : [result];
        const parsed = results.map(r => JSON.parse(r));
        return resolve(Array.isArray(result) ? parsed : parsed[0]);
      } catch (e) {
        return resolve(result);
      }
    });
  });
};

exports.get = (model, id) => {
  return toPromise(client, 'json_get', `${model}.${id}`, '.');
};

exports.find = async (model, filter) => {
  const ids = (await toPromise(client, 'smembers', model)).map(id => `${model}.${id}`);
  return toPromise(client, 'json_mget', ...ids, '.');
};

exports.create = async (model, data) => {
  const id = AppService.generateId();
  const doc = Object.assign({ id }, data);
  const multi = client.multi();
  multi.json_set(`${model}.${id}`, '.', JSON.stringify(doc));
  multi.sadd(model, id);
  await toPromise(multi, 'exec');
  return doc;
};

exports.update = async (model, id, data, doc) => {
  await toPromise(client, 'json_set', `${model}.${id}`, '.', JSON.stringify(Object.assign(doc, data)));
  return doc;
};

exports.delete = async (model, id, doc) => {
  const multi = client.multi();
  multi.json_del(`${model}.${id}`, '.');
  multi.srem(model, id);
  await toPromise(multi, 'exec');
  return doc;
};
