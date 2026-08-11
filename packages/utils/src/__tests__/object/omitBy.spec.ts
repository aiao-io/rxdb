import { describe, expect, expectTypeOf, it } from 'vitest';
import { omitBy } from '../../object/omitBy.js';
import { isNumber } from '../../types/index.js';

describe('omitBy', () => {
  it('1', () => {
    const object = { a: 1, b: '2', c: 3 };
    const data = omitBy(object, isNumber);
    expect(data).toEqual({ b: '2' });
  });

  describe('UTL-006 返回类型不得谎报完整 T', () => {
    it('不收窄键的断言返回 Partial<T>', () => {
      const omittedKeys = ['a'];
      const result = omitBy({ a: 1, b: 2 }, (_value, key) => omittedKeys.includes(key));

      expectTypeOf(result).toEqualTypeOf<Partial<{ a: number; b: number }>>();
      expect(result).toEqual({ b: 2 });
      // @ts-expect-error 可能已被删除的键不允许当作必定存在
      expect(() => result.a.toFixed()).toThrow(TypeError);
    });

    it('键类型谓词给出精确的键集合（TS 会自动推断出该谓词）', () => {
      const result = omitBy({ a: 1, b: 2 }, (_value, key) => key === 'a');

      expectTypeOf(result).toEqualTypeOf<Omit<{ a: number; b: number }, 'a'>>();
      expect(result.b.toFixed()).toEqual('2');
      // @ts-expect-error 已被 omit 的键不在返回类型里
      expect(result.a).toBeUndefined();
    });
  });
});
