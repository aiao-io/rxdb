import { describe, expect, it } from 'vitest';
import { needArray } from '../../array/index.js';

describe('needArray', () => {
  it('1', () => {
    const actual = needArray(1);
    expect(actual).toEqual([1]);
  });
  it('2', () => {
    const actual = needArray([1]);
    expect(actual).toEqual([1]);
  });
  it('2', () => {
    const actual = needArray(undefined);
    expect(actual).toEqual([]);
  });
});
