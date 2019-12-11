const UUID = require('uuid/v4');
const DeepMerge = require('deepmerge');
const { ObjectID } = require('mongodb');

exports.id = '3d896496-02a3-4ee5-8e42-2115eb215f7e';
exports.generateId = () => UUID();
exports.ucFirst = string => string.charAt(0).toUpperCase() + string.slice(1);
exports.isPlainObject = obj => typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof ObjectID);
exports.isScalarValue = value => ['String', 'Float', 'Boolean'].indexOf(value) > -1;
exports.deepMerge = (...args) => DeepMerge.all(args, { isMergeableObject: obj => exports.isPlainObject(obj) || Array.isArray(obj) });
exports.uniq = arr => [...new Set(arr.map(a => `${a}`))];
