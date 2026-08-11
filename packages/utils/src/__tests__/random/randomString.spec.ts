import { describe, expect, it } from 'vitest';
import { randomString } from '../../random/randomString.js';
import { isString } from '../../types/index.js';

describe('randomString', () => {
  it('randomString', () => {
    for (let i = 0; i < 100; i++) {
      const str = randomString(16);
      expect(str.length === 16).toBeTruthy();
      expect(isString(str)).toBeTruthy();
    }
  });
});

it('can select every character from a non-power-of-two alphabet', () => {
  const observed = new Set(randomString(20_000, '0123456789'));
  expect(observed).toEqual(new Set('0123456789'));
});

it('rejects invalid sizes and empty alphabets', () => {
  expect(() => randomString(-1)).toThrow(RangeError);
  expect(() => randomString(1.5)).toThrow(RangeError);
  expect(() => randomString(1, '')).toThrow(RangeError);
});
