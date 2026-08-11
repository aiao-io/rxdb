import { describe, expect, it } from 'vitest';
import { isPlainObject } from '../../types/isPlainObject.js';

describe('isPlainObject', () => {
  it('1', () => {
    expect(isPlainObject({ a: 1 })).toEqual(true);
  });
  it('2', () => {
    expect(isPlainObject(null)).toEqual(false);
  });
  it('3', () => {
    expect(isPlainObject({})).toBe(true);
  });
  it('4', () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
  it('5', () => {
    expect(isPlainObject(new Object())).toBe(true);
  });

  it('6', () => {
    expect(isPlainObject([])).toBe(false);
  });
  it('7', () => {
    expect(isPlainObject(new Date())).toBe(false);
  });
  it('8', () => {
    expect(isPlainObject(new Map())).toBe(false);
  });

  it('10', () => {
    const result = isPlainObject(new Uint8Array([1, 2, 3]));
    expect(result).toEqual(false);
  });
});
