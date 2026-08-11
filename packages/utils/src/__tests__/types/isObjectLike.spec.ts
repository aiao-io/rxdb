import { describe, expect, it } from 'vitest';
import { isObjectLike } from '../../types/isObjectLike.js';

describe('isObjectLike', () => {
  it('1', () => {
    expect(isObjectLike({ a: 1 })).toEqual(true);
  });
});
