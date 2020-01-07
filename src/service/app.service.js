exports.ucFirst = string => string.charAt(0).toUpperCase() + string.slice(1);
exports.lcFirst = string => string.charAt(0).toLowerCase() + string.slice(1);
exports.uniq = arr => [...new Set(arr.map(a => `${a}`))];
exports.timeout = ms => new Promise(res => setTimeout(res, ms));
exports.toGUID = (model, id) => Buffer.from(`${model},${id}`).toString('base64');
exports.fromGUID = guid => Buffer.from(`${guid}`, 'base64').toString('ascii').split(',');

exports.map = (mixed, fn) => {
  if (mixed == null) return mixed;
  const isArray = Array.isArray(mixed);
  const arr = isArray ? mixed : [mixed];
  const results = arr.map(el => fn(el));
  return isArray ? results : results[0];
};

exports.keyPaths = (obj, keys = [], path) => {
  return Object.entries(obj).reduce((prev, [key, value]) => {
    const keyPath = path ? `${path}.${key}` : key;
    prev.push(keyPath);
    if (exports.isPlainObject(value)) return exports.keyPaths(value, prev, keyPath);
    return prev;
  }, keys);
};

exports.promiseChain = (promises) => {
  return promises.reduce((chain, promise) => {
    return chain.then(chainResults => promise().then(promiseResult => [...chainResults, promiseResult]));
  }, Promise.resolve([]));
};

exports.proxyDeep = (obj, handler, proxyMap = new WeakMap(), path = '') => {
  obj = obj || {};
  if (proxyMap.has(obj)) return proxyMap.get(obj);

  const proxy = new Proxy(Object.entries(obj).reduce((prev, [key, value]) => {
    if (Array.isArray(value)) return Object.assign(prev, { [key]: value.map(v => (exports.isPlainObject(v) ? exports.proxyDeep(v, handler, proxyMap, path) : v)) });
    if (exports.isPlainObject(value)) return Object.assign(prev, { [key]: exports.proxyDeep(value, handler, proxyMap, path) });
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
