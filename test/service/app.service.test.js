const { ObjectID } = require('mongodb');
const { isPlainObject, deepMerge, uniq } = require('../../src/service/app.service');

const obj1 = {
  name: 'name1',
  friends: ['a', 'b', 'c'],
};

const obj2 = {
  name: 'name2',
  friends: ['d', 'e', 'f'],
};

const obj3 = {
  name: 'name3',
  friends: ['a', 'e', 'b'],
};

describe('AppService', () => {
  test('isPlainObject', () => {
    expect(isPlainObject(ObjectID('abclghalnohe'))).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject({})).toBe(true);
  });

  test('deepMerge', () => {
    expect(deepMerge(obj1, obj2)).toEqual({
      name: 'name2',
      friends: ['a', 'b', 'c', 'd', 'e', 'f'],
    });

    expect(deepMerge(obj1, obj2, obj3)).toEqual({
      name: 'name3',
      friends: ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'e', 'b'],
    });

    expect(obj1).toEqual({
      name: 'name1',
      friends: ['a', 'b', 'c'],
    });

    expect(obj2).toEqual({
      name: 'name2',
      friends: ['d', 'e', 'f'],
    });

    expect(obj3).toEqual({
      name: 'name3',
      friends: ['a', 'e', 'b'],
    });
  });

  test('uniq', () => {
    expect(uniq(['a', 'b', 'c', 'a', 'd', 'b'])).toEqual(['a', 'b', 'c', 'd']);
  });
});
