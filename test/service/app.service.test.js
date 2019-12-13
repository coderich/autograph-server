const { ObjectID } = require('mongodb');
const MicroMatch = require('micromatch');
const { isPlainObject, isScalarValue, mergeDeep, proxyDeep, uniq } = require('../../src/service/app.service');

const obj1 = { name: 'name1', friends: ['a', 'b', 'c'] };
const obj2 = { name: 'name2', friends: ['d', 'e', 'f'] };
const obj3 = { name: 'name3', friends: ['a', 'e', 'b'] };

const doc = {
  name: 'Richard',
  age: 100,
  family: [obj1, obj2, obj3],
  letters: ['a', 'b', 'c'],
  workplace: {
    name: 'gozio',
    address: 'gozio st',
    obj1,
    obj2,
    obj3,
  },
};

describe('AppService', () => {
  test('MicroMatch', () => {
    const glob = 'rich*';
    const re = MicroMatch.makeRe(glob, { nocase: true, lookbehinds: false, regex: true, unescape: true, maxLength: 100 });
    expect(re).toBeDefined();
  });

  test('isPlainObject', () => {
    expect(isPlainObject(ObjectID('abclghalnohe'))).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject({})).toBe(true);
  });

  test('mergeDeep', () => {
    // Expect concatenation
    expect(mergeDeep(obj1, obj2)).toEqual({ name: 'name2', friends: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(mergeDeep(obj1, obj2, obj3)).toEqual({ name: 'name3', friends: ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'e', 'b'] });

    // Expect originals not to change
    expect(obj1).toEqual({ name: 'name1', friends: ['a', 'b', 'c'] });
    expect(obj2).toEqual({ name: 'name2', friends: ['d', 'e', 'f'] });
    expect(obj3).toEqual({ name: 'name3', friends: ['a', 'e', 'b'] });
  });

  test('uniq', () => {
    expect(uniq(['a', 'b', 'c', 'a', 'd', 'b'])).toEqual(['a', 'b', 'c', 'd']);
  });

  test('proxyDeep', () => {
    const trapFn = jest.fn((target, prop, rec) => {
      const value = Reflect.get(target, prop, rec);
      if (isScalarValue(value)) return 1;
      if (typeof value === 'function') return value.bind(target);
      if (Array.isArray(value)) return value.map(v => (isScalarValue(v) ? 1 : v));
      return value;
    });

    const proxy = proxyDeep(doc, { get: trapFn }).toObject();
    expect(trapFn).toHaveBeenCalledTimes(31);
    expect(proxy.name).toBe(1);
    expect(proxy.workplace.name).toBe(1);
    expect(proxy.workplace.address).toBe(1);
    expect(proxy.workplace.obj1).toEqual({ name: 1, friends: [1, 1, 1] });
    expect(proxy.family[0]).toEqual({ name: 1, friends: [1, 1, 1] });
    expect(trapFn).toHaveBeenCalledTimes(31);
  });
});
