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
});
