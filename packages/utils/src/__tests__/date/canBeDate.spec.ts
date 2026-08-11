import { describe, expect, it } from 'vitest';
import { canBeDate } from '../../date/canBeDate.js';

describe('canBeDate', () => {
  it('null not date', () => {
    expect(canBeDate(null)).toBeFalsy();
  });
  it('{} not date', () => {
    expect(canBeDate({})).toBeFalsy();
  });
  it('abc not date', () => {
    expect(canBeDate('abc')).toBeFalsy();
  });

  it('20 not date', () => {
    expect(canBeDate('20')).toBeFalsy();
  });

  it('1 can be date', () => {
    expect(canBeDate(1)).toBeTruthy();
  });
  it('new Date() can be date', () => {
    expect(canBeDate(new Date())).toBeTruthy();
  });
  it('new Date(null as unknown as number) can be date', () => {
    expect(canBeDate(new Date(null as unknown as number))).toBeTruthy();
  });
  it('new Date().getTime() can be date', () => {
    expect(canBeDate(new Date().getTime())).toBeTruthy();
  });
  it('new Date().toISOString() can be date', () => {
    expect(canBeDate(new Date().toISOString())).toBeTruthy();
  });
});

it('rejects invalid Date objects and non-finite timestamps', () => {
  expect(canBeDate(new Date('invalid'))).toBe(false);
  expect(canBeDate(Number.NaN)).toBe(false);
  expect(canBeDate(Infinity)).toBe(false);
});

it('accepts the Unix epoch', () => {
  expect(canBeDate(0)).toBe(true);
});
