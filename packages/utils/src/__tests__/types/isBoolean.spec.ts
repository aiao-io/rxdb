import { describe, expect, it } from 'vitest';
import { isBoolean, isBooleanLike } from '../../types/isBoolean.js';

describe('isBoolean', () => {
  it('只对布尔原始值返回 true', () => {
    expect(isBoolean(true)).toEqual(true);
    expect(isBoolean(false)).toEqual(true);
  });

  it('拒绝 Boolean 包装对象（UTL-007）', () => {
    // 包装对象恒 truthy 且不与 false 全等，收窄成 `boolean` 后
    // `value === false` 恒假、`if (value)` 恒真 —— 编译器认知与运行时相反。
    expect(isBoolean(new Boolean(true))).toBe(false);
    expect(isBoolean(new Boolean(false))).toBe(false);
    expect(isBoolean(new Boolean())).toBe(false);
  });

  it('收窄后的值可安全参与全等比较（UTL-007）', () => {
    const values: unknown[] = [false, new Boolean(false)];
    // 谓词健全时只有原始 false 进入分支；旧实现让包装对象也进来，而 `v === false` 为假。
    expect(values.filter(isBoolean).filter(v => v === false)).toEqual([false]);
  });

  it('null 原型对象返回 false，不得抛 TypeError', () => {
    // 原型链上没有 valueOf，直接 `value.valueOf()` 会抛。
    expect(isBoolean(Object.create(null))).toBe(false);
    expect(isBoolean(Object.assign(Object.create(null), { a: 1 }))).toBe(false);
  });

  it('非布尔的对象与函数返回 false', () => {
    expect(isBoolean({})).toBe(false);
    expect(isBoolean([])).toBe(false);
    expect(isBoolean(new String('true'))).toBe(false);
    expect(isBoolean(() => true)).toBe(false);
    expect(isBoolean(null)).toBe(false);
    expect(isBoolean(undefined)).toBe(false);
  });
});

describe('isBooleanLike', () => {
  it('同时接纳原始值与包装对象', () => {
    expect(isBooleanLike(true)).toBe(true);
    expect(isBooleanLike(false)).toBe(true);
    expect(isBooleanLike(new Boolean(false))).toBe(true);
    expect(isBooleanLike(new Boolean())).toBe(true);
  });

  it('收窄为联合类型，强制调用方显式取值', () => {
    const boxed: unknown = new Boolean(false);
    expect(isBooleanLike(boxed) && boxed.valueOf()).toBe(false);
  });

  it('null 原型对象与其他包装类型返回 false', () => {
    expect(isBooleanLike(Object.create(null))).toBe(false);
    expect(isBooleanLike(new String('true'))).toBe(false);
    expect(isBooleanLike(new Number(0))).toBe(false);
    expect(isBooleanLike(null)).toBe(false);
    expect(isBooleanLike(undefined)).toBe(false);
    expect(isBooleanLike({})).toBe(false);
  });
});
