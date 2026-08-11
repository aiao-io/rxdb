import { describe, expect, it } from 'vitest';
import { createStableKey } from '../../object/createStableKey.js';

describe('createStableKey', () => {
  it('distinguishes primitive values and numeric edge cases', () => {
    const values = [null, undefined, 'value', true, false, 0, -0, 42, 1n];

    expect(new Set(values.map(value => createStableKey(value)))).toHaveLength(values.length);
    expect(createStableKey('value')).toBe(createStableKey('value'));
  });

  it('ignores object key order but not array order', () => {
    expect(createStableKey({ a: 1, b: 2 })).toBe(createStableKey({ b: 2, a: 1 }));
    expect(createStableKey([1, 2])).not.toBe(createStableKey([2, 1]));
  });

  // 朴素的 JSON.stringify + Object.keys 会把 Date 归一化成 {}：
  // where.createdAt 从 1 月改到 7 月算出同一个 key，列表静默停在旧数据。
  it('distinguishes Date values by instant', () => {
    expect(createStableKey(new Date('2026-01-01T00:00:00.000Z'))).not.toBe(
      createStableKey(new Date('2026-07-01T00:00:00.000Z'))
    );
    expect(createStableKey(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      createStableKey(new Date('2026-01-01T00:00:00.000Z'))
    );
  });

  it('distinguishes Map, Set and RegExp contents', () => {
    expect(createStableKey(new Map([['a', 1]]))).not.toBe(createStableKey(new Map([['a', 2]])));
    expect(createStableKey(new Set([1, 2]))).toBe(createStableKey(new Set([2, 1])));
    expect(createStableKey(/foo/g)).not.toBe(createStableKey(/foo/i));
  });

  it('keeps builtin container kinds mutually distinct', () => {
    const keys = [createStableKey(new Map()), createStableKey(new Set()), createStableKey(/(?:)/), createStableKey({})];

    expect(new Set(keys)).toHaveLength(keys.length);
  });

  it('treats shared references as plain values rather than cycles', () => {
    const shared = { active: true };

    expect(createStableKey({ left: shared, right: shared })).toBe(
      createStableKey({ left: { active: true }, right: { active: true } })
    );
  });

  it.each([
    ['function', { value: () => 'invalid' }],
    ['symbol', { value: Symbol('invalid') }],
    ['host object', { value: new WeakMap() }]
  ])('rejects %s values', (_name, value) => {
    expect(() => createStableKey(value)).toThrow(TypeError);
  });

  // 朴素实现会无限递归直接 RangeError
  it('rejects circular references with a clear error', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(() => createStableKey(value)).toThrow(/circular references/);
  });
});

// UTL-034：`Array.prototype.map` 跳过 hole 且不体现长度 ——
// `[,,]`（长度 2）与 `[]` 都产出 `array:[]`，两个语义不同的查询共用同一缓存 key。
describe('UTL-034 数组长度与 hole', () => {
  it('稀疏数组与空数组必须产生不同的 key', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(createStableKey([, ,])).not.toBe(createStableKey([]));
  });

  it('hole 与显式 undefined 必须区分', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(createStableKey([, 1])).not.toBe(createStableKey([undefined, 1]));
  });

  it('长度不同即 key 不同', () => {
    expect(createStableKey([1])).not.toBe(createStableKey([1, undefined]));
  });

  it('相同内容仍然稳定', () => {
    expect(createStableKey([1, 'a'])).toBe(createStableKey([1, 'a']));
  });
});
