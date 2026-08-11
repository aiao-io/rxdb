import { describe, expect, it } from 'vitest';
import { difference } from '../../array/index.js';

describe('difference', () => {
  it('1', () => {
    const actual = difference([0, 1, 2], [2, 3, 4]);
    expect(actual).toEqual([0, 1]);
  });
  it('2', () => {
    const actual = difference([], [2, 3, 4]);
    expect(actual).toEqual([]);
  });
});
