import { runInNewContext } from 'node:vm';
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

// 谓词收 unknown：Date 构造器对 bigint / Symbol / 无法转原始值的对象直接抛 TypeError，
// 混合输入逐项过滤时一个 1n 就终止整个过滤（RV-01a1bbb13a4871648c4b48e970813a31）。
describe('声明域之外的值返回 false 而不抛错', () => {
  it.each([
    ['bigint', 1n],
    ['Symbol', Symbol('date')],
    ['无原型对象', Object.create(null) as object],
    ['数组', [0]],
    ['带 valueOf 的普通对象', { valueOf: () => 0 }],
    ['函数', () => 0]
  ])('%s → false', (_label, value) => {
    expect(() => canBeDate(value)).not.toThrow();
    expect(canBeDate(value)).toBe(false);
  });

  it('混合输入可以直接用作过滤谓词', () => {
    const inputs: unknown[] = [1n, '2026-11-09', Symbol('x'), 0, null, new Date(0)];
    expect(inputs.filter(canBeDate)).toEqual(['2026-11-09', 0, new Date(0)]);
  });

  it('其他 realm 的 Date 仍按 Date 判定', () => {
    const foreign = runInNewContext('new Date(0)') as unknown;
    expect(foreign instanceof Date).toBe(false);
    expect(canBeDate(foreign)).toBe(true);
    expect(canBeDate(runInNewContext('new Date(NaN)'))).toBe(false);
  });

  it('只继承 Date.prototype、没有时间值的对象不是 Date', () => {
    const fake = Object.create(Date.prototype) as unknown;
    expect(() => canBeDate(fake)).not.toThrow();
    expect(canBeDate(fake)).toBe(false);
  });
});
