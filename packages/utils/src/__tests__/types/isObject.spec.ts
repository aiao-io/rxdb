import { describe, expect, it } from 'vitest';
import { isObject } from '../../types/isObject.js';

describe('isObject', () => {
  it('should return true for plain objects', () => {
    expect(isObject({})).toEqual(true);
    expect(isObject({ a: 1 })).toEqual(true);
    expect(isObject({ a: 1, b: 'test' })).toEqual(true);
  });

  it('should return false for arrays', () => {
    expect(isObject([])).toEqual(false);
    expect(isObject([1, 2, 3])).toEqual(false);
  });

  it('should return false for null', () => {
    expect(isObject(null)).toEqual(false);
  });

  it('should return false for undefined', () => {
    expect(isObject(undefined)).toEqual(false);
  });

  it('should return false for primitive types', () => {
    expect(isObject('string')).toEqual(false);
    expect(isObject(42)).toEqual(false);
    expect(isObject(true)).toEqual(false);
    expect(isObject(false)).toEqual(false);
  });

  it('should return false for dates', () => {
    expect(isObject(new Date())).toEqual(false);
  });

  it('should return false for regex', () => {
    expect(isObject(/test/)).toEqual(false);
  });

  it('should return false for objects created with Object.create(null)', () => {
    expect(isObject(Object.create(null))).toEqual(false);
  });
});
