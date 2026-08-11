import { describe, expect, it } from 'vitest';
import { zipObject } from '../../object/zipObject.js';
describe('zipObject', () => {
  it('1', () => {
    const zipped = zipObject(['a', 'b'], [1, 2]);
    expect(zipped).toEqual({ a: 1, b: 2 });
  });

  it('2', () => {
    const zipped = zipObject(['a', 'b'], (k, i) => k + i);
    expect(zipped).toEqual({ a: 'a0', b: 'b1' });
  });

  it('3', () => {
    const zipped = zipObject(['a', 'b'], 1);
    expect(zipped).toEqual({ a: 1, b: 1 });
  });
  it('4', () => {
    const zipped = zipObject([], 1);
    expect(zipped).toEqual({});
  });
});
