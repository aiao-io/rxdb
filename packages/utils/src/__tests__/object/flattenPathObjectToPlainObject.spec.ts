import { describe, expect, it } from 'vitest';
import { flattenPathObjectToPlainObject } from '../../object/flattenPathObjectToPlainObject.js';

describe('flattenPathObjectToPlainObject', () => {
  it('1', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a': 1 })).toEqual({ a: { a: 1 } });
  });
  it('2', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a[0]': 0, 'a.a[1]': 1 })).toEqual({ a: { a: [0, 1] } });
  });
  it('3', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a.0': 0, 'a.a.1': 1 })).toEqual({ a: { a: { '0': 0, '1': 1 } } });
  });
});

it('rejects prototype-polluting flattened paths', () => {
  expect(() => flattenPathObjectToPlainObject({ '__proto__.polluted': true })).toThrow(TypeError);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
