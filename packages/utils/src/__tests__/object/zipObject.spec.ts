import { describe, expect, it } from 'vitest';
import { zipObject } from '../../object/zipObject.js';
describe('zipObject', () => {
  it('1', () => {
    const zipped = zipObject(['a', 'b'], [1, 2]);
    expect(zipped).toEqual({ a: 1, b: 2 });
  });

  it('2', () => {
    const zipped = zipObject(['a', 'b'], (k, i) => k + i);
    expect(zipped).toEqual({ a: 'a0', b: 'b1' });
  });

  it('3', () => {
    const zipped = zipObject(['a', 'b'], 1);
    expect(zipped).toEqual({ a: 1, b: 1 });
  });
  it('4', () => {
    const zipped = zipObject([], 1);
    expect(zipped).toEqual({});
  });
});

// `acc[key] = value` 遇到 `__proto__` 键会走原型 setter：值没有成为自有属性，结果的原型被换掉。
describe('`__proto__` 键写成自有属性', () => {
  it('值数组 / 值工厂 / 固定值三种来源都不改结果原型', () => {
    const payload = { polluted: true };
    const results = [
      zipObject(['__proto__', 'a'], [payload, 1]),
      zipObject(['__proto__', 'a'], () => payload),
      zipObject(['__proto__', 'a'], payload)
    ];

    for (const result of results) {
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.keys(result)).toEqual(['__proto__', 'a']);
      expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(payload);
      expect((result as Record<string, unknown>)['polluted']).toBeUndefined();
    }
  });
});
