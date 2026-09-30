import { describe, expect, it } from 'vitest';
import * as core from '../../index.js';
import { assertOptionalNonNegativeSafeInteger, RxDBError } from '../../index.js';

describe('assertOptionalNonNegativeSafeInteger', () => {
  it('未提供时透传 undefined，不赋予领域默认值', () => {
    expect(assertOptionalNonNegativeSafeInteger(undefined, 'invalid')).toBeUndefined();
  });

  it.each([0, 1, 100, 100_000, Number.MAX_SAFE_INTEGER])('非负安全整数 %s 原样返回', value => {
    expect(assertOptionalNonNegativeSafeInteger(value, 'invalid')).toBe(value);
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1 OR 1=1', null, true])(
    '非法值 %s 抛出调用方指定的 RxDBError',
    value => {
      const message = `invalid bound: ${String(value)}`;
      const validate = () => assertOptionalNonNegativeSafeInteger(value as number, message);
      expect(validate).toThrow(RxDBError);
      expect(validate).toThrow(message);
    }
  );

  it('核心不导出树领域校验', () => {
    expect(core).not.toHaveProperty('assertTreeLevel');
  });
});
