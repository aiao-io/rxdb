import { describe, expect, it } from 'vitest';
import { isIntArray } from '../../types/isIntArray.js';
describe('isIntArray', () => {
  it('1', () => {
    expect(isIntArray([1, 2, 3, 22.2])).toEqual(false);
  });
  it('1', () => {
    expect(isIntArray([1, 2, 3, 4])).toEqual(true);
  });
});
