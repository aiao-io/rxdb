import { describe, expect, it } from 'vitest';
import {
  assertNonNegativeSafeInt,
  assertPositiveSafeInt,
  assertSearchNumericOptions
} from '../../core/options-guard.js';
import { SearchError } from '../../types.js';

// SRCH-006：SearchOptions / SearchPluginOptions 上的数值字段全是裸 `number?`，
// 入口没有任何运行时校验。`pageSize: -5` 会直接拼进 SQL 的 LIMIT，
// `NaN` 让查询静默返回空集 —— 这类值必须在入口挡掉。
describe('options-guard', () => {
  describe('assertPositiveSafeInt', () => {
    it('undefined 表示未设置，放行', () => {
      expect(() => assertPositiveSafeInt('pageSize', undefined)).not.toThrow();
    });

    it.each([1, 50, 1000])('接受正安全整数 %s', value => {
      expect(() => assertPositiveSafeInt('pageSize', value)).not.toThrow();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('拒绝 %s', value => {
      expect(() => assertPositiveSafeInt('pageSize', value)).toThrow(SearchError);
    });

    it('错误信息带上选项名与实际值', () => {
      expect(() => assertPositiveSafeInt('pageSize', -5)).toThrow(/pageSize.*-5/);
    });
  });

  describe('assertNonNegativeSafeInt', () => {
    it('0 是合法值（关闭防抖）', () => {
      expect(() => assertNonNegativeSafeInt('debounce', 0)).not.toThrow();
    });

    it.each([-1, 1.5, Number.NaN])('拒绝 %s', value => {
      expect(() => assertNonNegativeSafeInt('debounce', value)).toThrow(SearchError);
    });
  });

  describe('assertSearchNumericOptions', () => {
    it('undefined 选项对象放行', () => {
      expect(() => assertSearchNumericOptions('SearchOptions', undefined)).not.toThrow();
    });

    it('逐字段校验并指明来源', () => {
      expect(() => assertSearchNumericOptions('SearchOptions', { pageSize: -5 })).toThrow(/SearchOptions\.pageSize/);
      expect(() => assertSearchNumericOptions('SearchOptions', { snippetLength: 0 })).toThrow(
        /SearchOptions\.snippetLength/
      );
      expect(() => assertSearchNumericOptions('SearchOptions', { debounce: -1 })).toThrow(/SearchOptions\.debounce/);
    });
  });
});
