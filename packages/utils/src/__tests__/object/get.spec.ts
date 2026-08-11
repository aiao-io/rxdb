import { describe, expect, it } from 'vitest';
import { get } from '../../object/get.js';

describe('get', () => {
  it('1', () => {
    const object = { a: [{ b: [{ d: [1] }] }] };
    expect(get(object, 'a[0].b[0].d[0]')).toEqual(1);
  });

  it('2', () => {
    const object = { a: [{ b: { c: 1 } }] };
    expect(get(object, 'a[0].b.c')).toEqual(1);
  });

  describe('UTL-013 falsy 值不得被默认值改写', () => {
    it.each([[0], [false], [''], [Number.NaN]])('字面量点号键上的 %s 原样返回', value => {
      expect(get({ 'a.b': value }, 'a.b', 'D')).toEqual(value);
    });

    it.each([[0], [false], ['']])('嵌套路径上的 %s 原样返回', value => {
      expect(get({ a: { b: value } }, 'a.b', 'D')).toEqual(value);
    });

    it('数组下标上的 falsy 值原样返回', () => {
      expect(get({ a: [0] }, 'a[0]', 'D')).toEqual(0);
      expect(get({ a: [{ b: false }] }, 'a[0].b', 'D')).toEqual(false);
    });
  });

  describe('UTL-013 命中判定不依赖引用相等', () => {
    it('自引用命中时返回该对象而不是默认值', () => {
      const object: Record<string, unknown> = { name: 'root' };
      object['self'] = object;
      expect(get(object, 'self', 'D')).toBe(object);
    });

    it('嵌套自引用同样命中', () => {
      const object: Record<string, unknown> = { name: 'root' };
      object['child'] = { parent: object };
      expect(get(object, 'child.parent', 'D')).toBe(object);
    });
  });

  describe('UTL-013 字面量键优先于嵌套路径', () => {
    it('字面量点号键存在时不再走嵌套解析', () => {
      expect(get({ 'a.b': 'literal', a: { b: 'nested' } }, 'a.b')).toEqual('literal');
    });

    it('字面量点号键不存在时回退到嵌套解析', () => {
      expect(get({ a: { b: 'nested' } }, 'a.b')).toEqual('nested');
    });
  });

  describe('UTL-013 未命中仍返回默认值', () => {
    it.each([
      [{}, 'a.b'],
      [{ a: null }, 'a.b'],
      [{ a: undefined }, 'a.b'],
      [{ a: 1 }, 'a.b.c'],
      [{ a: { b: undefined } }, 'a.b'],
      [null, 'a'],
      [undefined, 'a'],
      [{ a: 1 }, '']
    ])('%o 的 %s 返回默认值', (object, path) => {
      expect(get(object, path, 'D')).toEqual('D');
    });

    it('未命中且未传默认值时返回 undefined', () => {
      expect(get({}, 'a.b')).toBeUndefined();
    });
  });
});
