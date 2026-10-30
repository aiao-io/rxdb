import { describe, expect, it } from 'vitest';
import { flattenPathObjectToPlainObject } from '../../object/flattenPathObjectToPlainObject.js';
import { plainObjectToFlattenPathObject } from '../../object/plainObjectToFlattenPathObject.js';

describe('plainObjectToFlattenPathObject', () => {
  it('1', () => {
    expect(plainObjectToFlattenPathObject({ a: { a: 1 } })).toEqual({ 'a.a': 1 });
  });
  it('2', () => {
    expect(plainObjectToFlattenPathObject({ a: { a: [0, 1] } })).toEqual({ 'a.a[0]': 0, 'a.a[1]': 1 });
  });
  it('3', () => {
    expect(plainObjectToFlattenPathObject({ a: { a: { '0': 0, '1': 1 } } })).toEqual({ 'a.a.0': 0, 'a.a.1': 1 });
  });
  it('4', () => {
    expect(plainObjectToFlattenPathObject({ a: { a: new Date(1) } })).toEqual({ 'a.a': new Date(1) });
  });

  describe('UTL-012 空容器必须留下叶子', () => {
    it('顶层空数组与空对象不得消失', () => {
      expect(plainObjectToFlattenPathObject({ a: [], b: {}, c: 1 })).toEqual({ a: [], b: {}, c: 1 });
    });

    it('嵌套空容器不得消失', () => {
      expect(plainObjectToFlattenPathObject({ a: { b: [], c: {} } })).toEqual({ 'a.b': [], 'a.c': {} });
    });

    it('数组元素里的空容器不得消失', () => {
      expect(plainObjectToFlattenPathObject({ a: [[], {}, 1] })).toEqual({
        'a[0]': [],
        'a[1]': {},
        'a[2]': 1
      });
    });

    it('根级空容器不产生空字符串键', () => {
      expect(plainObjectToFlattenPathObject({})).toEqual({});
      expect(plainObjectToFlattenPathObject([])).toEqual({});
    });
  });

  describe('UTL-012 往返转换', () => {
    it.each([
      [{ a: [], b: {}, c: 1 }],
      [{ a: { b: [], c: {} } }],
      [{ a: [[], {}, 1] }],
      [{ a: { a: [0, 1] } }],
      [{ a: { b: { c: 'x' } }, d: [] }]
    ])('%o 扁平化后可原样还原', object => {
      const flattened = plainObjectToFlattenPathObject(object);
      expect(flattenPathObjectToPlainObject(flattened)).toEqual(object);
    });
  });

  // 扁平结果里数组长度只能由写出的最大下标推出：末位是空洞时没有任何键能承载长度，
  // `forEach` 跳过空洞后全空洞数组整个消失、尾部空洞把数组缩短。
  // 往返断言用 toStrictEqual：它区分空洞与显式 undefined，toEqual 不区分。
  describe('稀疏数组', () => {
    it('全空洞数组抛 TypeError，而不是整个消失', () => {
      expect(() => plainObjectToFlattenPathObject({ items: new Array(2) })).toThrow(TypeError);
      expect(() => plainObjectToFlattenPathObject({ items: new Array(2) })).toThrow(/"items"/);
    });

    it('尾部空洞抛 TypeError，而不是把数组缩短', () => {
      // eslint-disable-next-line no-sparse-arrays
      expect(() => plainObjectToFlattenPathObject({ items: [1, ,] })).toThrow(TypeError);
      // eslint-disable-next-line no-sparse-arrays
      expect(() => plainObjectToFlattenPathObject({ a: { b: [[1, ,]] } })).toThrow(/"a\.b\[0\]"/);
    });

    it('显式 undefined 写成叶子，往返后长度与值不变', () => {
      const object = { items: [1, undefined] };

      const flattened = plainObjectToFlattenPathObject(object);

      expect(flattened).toStrictEqual({ 'items[0]': 1, 'items[1]': undefined });
      expect(Object.hasOwn(flattened, 'items[1]')).toBe(true);
      expect(flattenPathObjectToPlainObject(flattened)).toStrictEqual(object);
    });

    it('密集数组往返不变', () => {
      const object = { items: [1, 'x', null, { id: 1 }] };

      expect(flattenPathObjectToPlainObject(plainObjectToFlattenPathObject(object))).toStrictEqual(object);
    });

    it('中间空洞由缺席的下标表示，往返后空洞位置不变', () => {
      // eslint-disable-next-line no-sparse-arrays
      const object = { items: [1, , 3] };

      const flattened = plainObjectToFlattenPathObject(object);
      const restored = flattenPathObjectToPlainObject(flattened) as { items: unknown[] };

      expect(flattened).toStrictEqual({ 'items[0]': 1, 'items[2]': 3 });
      expect(restored.items).toHaveLength(3);
      expect(Object.hasOwn(restored.items, 1)).toBe(false);
      expect(restored).toStrictEqual(object);
    });
  });
});
