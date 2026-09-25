import { RxDBError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { assertTreeLevel } from '../../index.js';

/**
 * `level` 是唯一一个被**直接字符串插值**进树查询 SQL 的选项
 * （pglite `query_tree_sql.ts` 与 sqlite-core `query_tree_sql.ts` 都不参数化它），
 * 因此它的合法性判定必须在唯一一处收口，且失败即抛错——不裁剪、不兜默认值。
 */
describe('assertTreeLevel', () => {
  it('保留树查询的错误文案', () => {
    expect(() => assertTreeLevel(-1)).toThrow("tree query 'level' must be a non-negative integer, received: -1");
  });

  it('未提供时返回 undefined，表示不限深度', () => {
    expect(assertTreeLevel(undefined)).toBeUndefined();
  });

  it('非负整数原样返回', () => {
    expect(assertTreeLevel(0)).toBe(0);
    expect(assertTreeLevel(1)).toBe(1);
    expect(assertTreeLevel(100)).toBe(100);
  });

  it('不设上界：超大层级原样透传，深度由调用方决定', () => {
    expect(assertTreeLevel(101)).toBe(101);
    expect(assertTreeLevel(100_000)).toBe(100_000);
    expect(assertTreeLevel(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('负数抛错，不裁剪', () => {
    expect(() => assertTreeLevel(-1)).toThrow(RxDBError);
  });

  it('非整数抛错', () => {
    expect(() => assertTreeLevel(1.5)).toThrow(RxDBError);
    expect(() => assertTreeLevel(Number.NaN)).toThrow(RxDBError);
    expect(() => assertTreeLevel(Number.POSITIVE_INFINITY)).toThrow(RxDBError);
    expect(() => assertTreeLevel(Number.MAX_SAFE_INTEGER + 2)).toThrow(RxDBError);
  });

  it('非数字（来自无类型调用方）抛错，杜绝 SQL 注入', () => {
    expect(() => assertTreeLevel('1; DROP TABLE menu --' as unknown as number)).toThrow(RxDBError);
    expect(() => assertTreeLevel(null as unknown as number)).toThrow(RxDBError);
  });

  it('错误信息带上收到的值，便于定位注入来源', () => {
    expect(() => assertTreeLevel('1 OR 1=1' as unknown as number)).toThrow(/1 OR 1=1/);
  });
});
