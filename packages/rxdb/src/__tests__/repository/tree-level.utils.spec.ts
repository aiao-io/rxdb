import { describe, expect, it } from 'vitest';
import { assertTreeLevel, TREE_MAX_LEVEL } from '../../repository/tree-level.utils.js';
import { RxDBError } from '../../RxDBError.js';

/**
 * `level` 是唯一一个被**直接字符串插值**进树查询 SQL 的选项
 * （pglite `query_tree_sql.ts` 与 sqlite-core `query_tree_sql.ts` 都不参数化它），
 * 因此它的合法性判定必须在唯一一处收口，且失败即抛错——不裁剪、不兜默认值。
 */
describe('assertTreeLevel', () => {
  it('未提供时按 FindTreeOptions 契约默认 0（仅当前节点）', () => {
    expect(assertTreeLevel(undefined)).toBe(0);
  });

  it('0..TREE_MAX_LEVEL 的整数原样返回', () => {
    expect(assertTreeLevel(0)).toBe(0);
    expect(assertTreeLevel(1)).toBe(1);
    expect(assertTreeLevel(TREE_MAX_LEVEL)).toBe(TREE_MAX_LEVEL);
  });

  it('越界值抛错，不裁剪', () => {
    expect(() => assertTreeLevel(-1)).toThrow(RxDBError);
    expect(() => assertTreeLevel(TREE_MAX_LEVEL + 1)).toThrow(RxDBError);
  });

  it('非整数抛错', () => {
    expect(() => assertTreeLevel(1.5)).toThrow(RxDBError);
    expect(() => assertTreeLevel(Number.NaN)).toThrow(RxDBError);
    expect(() => assertTreeLevel(Number.POSITIVE_INFINITY)).toThrow(RxDBError);
  });

  it('非数字（来自无类型调用方）抛错，杜绝 SQL 注入', () => {
    expect(() => assertTreeLevel('1; DROP TABLE menu --' as unknown as number)).toThrow(RxDBError);
    expect(() => assertTreeLevel(null as unknown as number)).toThrow(RxDBError);
  });

  it('错误信息带上收到的值，便于定位注入来源', () => {
    expect(() => assertTreeLevel('1 OR 1=1' as unknown as number)).toThrow(/1 OR 1=1/);
  });
});
