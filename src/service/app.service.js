const UUID = require('uuid/v4');
const DeepMerge = require('deepmerge');
const { ObjectID } = require('mongodb');

let modelStores = {};

exports.id = '3d896496-02a3-4ee5-8e42-2115eb215f7e';
exports.generateId = () => UUID();
exports.ucFirst = string => string.charAt(0).toUpperCase() + string.slice(1);
exports.isPlainObject = obj => typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof ObjectID);
exports.isScalarValue = value => typeof value !== 'object' && typeof value !== 'function';
exports.mergeDeep = (...args) => DeepMerge.all(args, { isMergeableObject: obj => exports.isPlainObject(obj) || Array.isArray(obj) });
exports.uniq = arr => [...new Set(arr.map(a => `${a}`))];
exports.timeout = ms => new Promise(res => setTimeout(res, ms));

exports.promiseChain = (promises) => {
  return promises.reduce((chain, promise) => {
    return chain.then(chainResults => promise().then(promiseResult => [...chainResults, promiseResult]));
  }, Promise.resolve([]));
};

exports.modelStores = (stores) => {
  if (stores) {
    modelStores = stores;
  }

  return modelStores;
};

exports.proxyDeep = (obj, handler, proxyMap = new WeakMap()) => {
  if (proxyMap.has(obj)) return proxyMap.get(obj);

  const proxy = new Proxy(Object.entries(obj).reduce((prev, [key, value]) => {
    if (Array.isArray(value)) return Object.assign(prev, { [key]: value.map(v => (exports.isPlainObject(v) ? exports.proxyDeep(v, handler, proxyMap) : v)) });
    if (exports.isPlainObject(value)) return Object.assign(prev, { [key]: exports.proxyDeep(value, handler, proxyMap) });
    return Object.assign(prev, { [key]: value });
  }, {}), handler);

  const finalProxy = Object.defineProperty(proxy, 'toObject', {
    get() {
      return (getMap = new WeakMap()) => {
        if (getMap.has(this)) return getMap.get(this);

        const plainObject = Object.entries(this).reduce((prev, [key, value]) => {
          if (Array.isArray(value)) return Object.assign(prev, { [key]: value.map(v => (v.toObject ? v.toObject(getMap) : v)) });
          return Object.assign(prev, { [key]: value.toObject ? value.toObject(getMap) : value });
        }, {});

        getMap.set(this, plainObject);

        return plainObject;
      };
    },
  });

  proxyMap.set(obj, finalProxy);

  return finalProxy;
};
