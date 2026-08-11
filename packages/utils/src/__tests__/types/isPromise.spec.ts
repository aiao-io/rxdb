import { describe, expect, it } from 'vitest';
import { isPromise } from '../../types/isPromise.js';

describe('isPromise', () => {
  it('1', () => {
    expect(isPromise(new Promise(res => res(0)))).toEqual(true);
    expect(isPromise(new Promise(res => res('')))).toEqual(true);
  });
  it('2', () => {
    expect(isPromise(22)).toEqual(false);
    expect(isPromise({ name: 'x' })).toEqual(false);
    expect(isPromise('abc')).toEqual(false);
    expect(isPromise(String('abc'))).toEqual(false);
    expect(isPromise([1, 2, 3])).toEqual(false);
    expect(isPromise(Symbol(''))).toEqual(false);
    expect(isPromise(Symbol('hello'))).toEqual(false);
    expect(isPromise({ then: 2 })).toEqual(false);
  });
  it('3', () => {
    expect(isPromise(null)).toEqual(false);
  });
});
