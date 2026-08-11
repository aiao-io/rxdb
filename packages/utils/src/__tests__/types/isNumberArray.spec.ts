import { describe, expect, it } from 'vitest';
import { isNumberArray } from '../../types/isNumberArray.js';

describe('isNumberArray', () => {
  it('1', () => {
    expect(isNumberArray([1, 2, 3, '22.2'])).toEqual(false);
  });
  it('1', () => {
    expect(isNumberArray([1, 2, 3, 4])).toEqual(true);
  });
});
