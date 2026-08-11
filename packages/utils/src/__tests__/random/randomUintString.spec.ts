import { describe, expect, it } from 'vitest';
import { randomUintString } from '../../random/randomUintString.js';

describe('randomUintString', () => {
  it('randomUintString', () => {
    for (let i = 0; i < 100; i++) {
      const str = randomUintString();
      expect(str.length === 16).toBeTruthy();
      expect(/^[1-9][0-9]{15}$/.test(str)).toBeTruthy();
    }
  });
});

it('can generate every non-zero leading digit', () => {
  const observed = new Set(Array.from({ length: 10_000 }, () => randomUintString(1)));
  expect(observed).toEqual(new Set('123456789'));
});

it('supports an empty result and rejects negative lengths', () => {
  expect(randomUintString(0)).toBe('');
  expect(() => randomUintString(-1)).toThrow(RangeError);
});
