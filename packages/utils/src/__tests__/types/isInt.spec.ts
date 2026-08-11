import { describe, expect, it } from 'vitest';
import { isInt } from '../../types/isInt.js';
describe('isInt', () => {
  it('1', () => {
    expect(isInt(22.2)).toEqual(false);
  });
  it('1', () => {
    expect(isInt(22)).toEqual(true);
  });
});
