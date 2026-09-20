import { describe, expect, it } from 'vitest';
import { structuralEqual } from '../../../query-builder/utils/structural-equal.js';

describe('structuralEqual', () => {
  it('应该对基本类型进行严格相等比较', () => {
    expect(structuralEqual(1, 1)).toBe(true);
    expect(structuralEqual('a', 'a')).toBe(true);
    expect(structuralEqual(true, true)).toBe(true); // 同值同类型
    expect(structuralEqual(1, 2)).toBe(false);
    expect(structuralEqual('a', 'b')).toBe(false);
  });

  it('应该正确处理 null', () => {
    expect(structuralEqual(null, null)).toBe(true);
    expect(structuralEqual(null, undefined)).toBe(false);
    expect(structuralEqual(null, 0)).toBe(false);
    expect(structuralEqual(null, '')).toBe(false);
  });

  it('应该正确处理 undefined', () => {
    expect(structuralEqual(undefined, undefined)).toBe(true);
    expect(structuralEqual(undefined, null)).toBe(false);
  });

  it('应该正确处理不同类型', () => {
    expect(structuralEqual(1, '1')).toBe(false);
    expect(structuralEqual(0, false)).toBe(false);
    expect(structuralEqual('', false)).toBe(false);
  });

  it('应该正确处理数组', () => {
    expect(structuralEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(structuralEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structuralEqual([], [])).toBe(true);
    expect(structuralEqual([1], [2])).toBe(false);
  });

  it('应该正确处理嵌套数组', () => {
    expect(
      structuralEqual(
        [
          [1, 2],
          [3, 4]
        ],
        [
          [1, 2],
          [3, 4]
        ]
      )
    ).toBe(true);
    expect(structuralEqual([[1, 2]], [[1, 2, 3]])).toBe(false);
  });

  it('应该正确处理对象', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(structuralEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(structuralEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(structuralEqual({}, {})).toBe(true);
  });

  it('应该正确处理嵌套对象', () => {
    expect(structuralEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(structuralEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('应该正确处理混合嵌套结构', () => {
    expect(structuralEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(structuralEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });

  it('应该忽略对象 key 顺序', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('应该正确处理包含额外属性的对象', () => {
    expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(structuralEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('应该正确处理 Date 对象', () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-01');
    // Date 对象使用相同的引用比较
    expect(structuralEqual(date1, date2)).toBe(true);
  });

  it('应该正确处理 Symbol', () => {
    const sym = Symbol('test');
    expect(structuralEqual(sym, sym)).toBe(true);
  });

  it('应该处理循环引用而不陷入无限递归', () => {
    const a: Record<string, unknown> = { x: 1 };
    a['self'] = a;
    const b: Record<string, unknown> = { x: 1 };
    b['self'] = b;
    expect(structuralEqual(a, b)).toBe(true);
  });

  it('应该处理数组中的循环引用', () => {
    const a: unknown[] = [1, 2];
    a.push(a);
    const b: unknown[] = [1, 2];
    b.push(b);
    expect(structuralEqual(a, b)).toBe(true);
  });

  it('应该按左右对象对跟踪共享引用', () => {
    const shared = {};
    expect(structuralEqual({ x: shared, y: shared }, { x: {}, y: { extra: true } })).toBe(false);
  });

  it('应该拒绝非对称循环引用', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = {};
    expect(structuralEqual(a, b)).toBe(false);
  });
});
