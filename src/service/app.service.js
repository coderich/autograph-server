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

exports.queryPaths = (model, obj) => {
  return exports.keyPaths(obj).filter(path => path.indexOf('edges.cursor') === -1).map((path) => {
    return path.replace(/edges|node/gi, '').replace(/^\.+|\.+$/g, '');
  }).filter(a => a);
};

exports.isPlainObject = obj => typeof obj === 'object' && !Array.isArray(obj);
