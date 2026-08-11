import { describe, expect, it } from 'vitest';
import { isStringArray } from '../../types/isStringArray.js';

describe('isStringArray', () => {
  it('1', () => {
    expect(isStringArray([1, 2, 3, '22.2'])).toEqual(false);
  });
  it('2', () => {
    expect(isStringArray(['1', '2', '3', '4'])).toEqual(true);
  });
  it('3', () => {
    expect(isStringArray([1, '2', '3', '4'])).toEqual(false);
  });
  it('4', () => {
    expect(isStringArray('1')).toEqual(false);
  });
});
