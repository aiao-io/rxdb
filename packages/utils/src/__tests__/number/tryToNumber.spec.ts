import { describe, expect, it } from 'vitest';
import { tryToNumber } from '../../number/tryToNumber.js';

describe('tryToNumber', () => {
  it('1', () => {
    expect(tryToNumber(1)).toEqual(1);
    expect(tryToNumber(1.1)).toEqual(1.1);
    expect(tryToNumber('1')).toEqual(1);
    expect(tryToNumber('1.1')).toEqual(1.1);
    expect(tryToNumber(Number())).toEqual(0);
    expect(tryToNumber(Infinity)).toEqual(Infinity);
    expect(tryToNumber(Infinity + Infinity)).toEqual(Infinity);
    expect(tryToNumber({})).toEqual({});
    expect(tryToNumber([])).toEqual([]);
    expect(tryToNumber('a')).toEqual('a');
    expect(tryToNumber(false)).toEqual(false);
    expect(tryToNumber(true)).toEqual(true);
    expect(tryToNumber('')).toEqual('');
    expect(tryToNumber(' ')).toEqual(' ');
  });
});
