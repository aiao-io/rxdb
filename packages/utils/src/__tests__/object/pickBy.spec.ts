import { describe, expect, expectTypeOf, it } from 'vitest';
import { pickBy } from '../../object/pickBy.js';

describe('pickBy', () => {
  it('should pick properties based on the predicate function', () => {
    const obj = { a: 1, b: 'pick', c: 3 };
    const shouldPick = (value: string | number) => typeof value === 'string';
    const result = pickBy(obj, shouldPick);
    expect(result).toEqual({ b: 'pick' });
  });

  it('should return an empty object if no properties satisfy the predicate', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const shouldPick = (value: number) => typeof value === 'string';
    const result = pickBy(obj, shouldPick);
    expect(result).toEqual({});
  });

  it('should return the same object if all properties satisfy the predicate', () => {
    const obj = { a: 'pick', b: 'pick', c: 'pick' };
    const shouldPick = (value: string) => typeof value === 'string';
    const result = pickBy(obj, shouldPick);
    expect(result).toEqual(obj);
  });

  it('should work with an empty object', () => {
    const obj = {};
    const shouldPick = (value: unknown) => Boolean(value);
    const result = pickBy(obj, shouldPick);
    expect(result).toEqual({});
  });

  it('should work with nested objects', () => {
    const obj = { a: 1, b: { nested: 'pick' }, c: 3 };
    const shouldPick = (value: number | { nested: string }, key: string) => key === 'b';
    const result = pickBy(obj, shouldPick);
    expect(result).toEqual({ b: { nested: 'pick' } });
  });

  describe('UTL-006 返回类型不得谎报完整 T', () => {
    it('不收窄键的断言返回 Partial<T>', () => {
      const keptKeys = ['a'];
      const result = pickBy({ a: 1, b: 2 }, (_value, key) => keptKeys.includes(key));

      expectTypeOf(result).toEqualTypeOf<Partial<{ a: number; b: number }>>();
      expect(result).toEqual({ a: 1 });
      // @ts-expect-error 可能已被删除的键不允许当作必定存在
      expect(() => result.b.toFixed()).toThrow(TypeError);
    });

    it('键类型谓词给出精确的键集合（TS 会自动推断出该谓词）', () => {
      const result = pickBy({ a: 1, b: 2 }, (_value, key) => key === 'a');

      expectTypeOf(result).toEqualTypeOf<Pick<{ a: number; b: number }, 'a'>>();
      expect(result.a.toFixed()).toEqual('1');
      // @ts-expect-error 未被 pick 的键不在返回类型里
      expect(result.b).toBeUndefined();
    });

    it('显式书写的键类型谓词同样精确', () => {
      const result = pickBy({ a: 1, b: 2 }, (_value, key): key is 'a' => key === 'a');

      expectTypeOf(result).toEqualTypeOf<Pick<{ a: number; b: number }, 'a'>>();
      expect(result).toEqual({ a: 1 });
    });
  });
});
