import { describe, expect, it } from 'vitest';
import { isEmpty } from '../../types/isEmpty.js';

describe('isEmpty', () => {
  class Data {}
  class Person {
    name = 'ray';
  }
  it('1', () => {
    expect(isEmpty(null)).toEqual(true);
    expect(isEmpty(undefined)).toEqual(true);
    expect(isEmpty(new Data())).toEqual(true);
    expect(isEmpty(0)).toEqual(true);
    expect(isEmpty(true)).toEqual(true);
    expect(isEmpty([])).toEqual(true);
    expect(isEmpty(false)).toEqual(true);
    expect(isEmpty({})).toEqual(true);
    expect(isEmpty('')).toEqual(true);
    expect(isEmpty(String())).toEqual(true);
    expect(isEmpty(new Map())).toEqual(true);
  });

  it('2', () => {
    expect(isEmpty(new Date())).toEqual(false);
    expect(isEmpty(new Date('2022-09-01T02:19:55.976Z'))).toEqual(false);
    expect(isEmpty(22)).toEqual(false);
    expect(isEmpty(new Person())).toEqual(false);
    expect(isEmpty({ name: 'x' })).toEqual(false);
    expect(isEmpty('abc')).toEqual(false);
    expect(isEmpty(String('abc'))).toEqual(false);
    expect(isEmpty([1, 2, 3])).toEqual(false);
    expect(
      isEmpty(function work() {
        //
      })
    ).toEqual(false);
    expect(
      isEmpty(() => {
        //
      })
    ).toEqual(false);
    expect(isEmpty(Symbol(''))).toEqual(false);
    expect(isEmpty(Symbol('hello'))).toEqual(false);
    const map = new Map();
    map.set('a', 1);
    expect(isEmpty(map)).toEqual(false);
  });

  it('3', () => {
    expect(isEmpty(new Date('invalid value'))).toEqual(true);
  });
});
