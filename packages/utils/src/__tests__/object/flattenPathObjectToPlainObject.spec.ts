import { describe, expect, it } from 'vitest';
import { flattenPathObjectToPlainObject } from '../../object/flattenPathObjectToPlainObject.js';
import { plainObjectToFlattenPathObject } from '../../object/plainObjectToFlattenPathObject.js';

describe('flattenPathObjectToPlainObject', () => {
  it('1', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a': 1 })).toEqual({ a: { a: 1 } });
  });
  it('2', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a[0]': 0, 'a.a[1]': 1 })).toEqual({ a: { a: [0, 1] } });
  });
  it('3', () => {
    expect(flattenPathObjectToPlainObject({ 'a.a.0': 0, 'a.a.1': 1 })).toEqual({ a: { a: { '0': 0, '1': 1 } } });
  });
});

it('rejects prototype-polluting flattened paths', () => {
  expect(() => flattenPathObjectToPlainObject({ '__proto__.polluted': true })).toThrow(TypeError);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

// 容器类型曾按「整条路径是否含 `[n]`」二选一，也不检查路径之间的冲突：
// 数组上被写进普通属性（JSON 看不见）、叶子被容器覆盖、`.0[1]` 的对象层被建成数组。
describe('容器类型由路径语法决定，冲突即抛', () => {
  it('同一容器混用数组下标与属性名时抛 TypeError，与键顺序无关', () => {
    expect(() => flattenPathObjectToPlainObject({ 'a[0]': 1, 'a.b': 2 })).toThrow(TypeError);
    expect(() => flattenPathObjectToPlainObject({ 'a.b': 2, 'a[0]': 1 })).toThrow(TypeError);
    expect(() => flattenPathObjectToPlainObject({ 'a[0]': 1, 'a[01]': 2 })).toThrow(TypeError);
  });

  it('同一路径既是叶子又是容器时抛 TypeError，与键顺序无关', () => {
    expect(() => flattenPathObjectToPlainObject({ a: 1, 'a.b': 2 })).toThrow(TypeError);
    expect(() => flattenPathObjectToPlainObject({ 'a.b': 2, a: 1 })).toThrow(TypeError);
  });

  it('叶子值本身是容器时不被后续路径写入', () => {
    const leaf: unknown[] = [];

    expect(() => flattenPathObjectToPlainObject({ a: leaf, 'a[0]': 1 })).toThrow(TypeError);
    expect(leaf).toEqual([]);
  });

  it('根级数组下标与空路径抛 TypeError', () => {
    expect(() => flattenPathObjectToPlainObject({ '[0]': 1 })).toThrow(TypeError);
    expect(() => flattenPathObjectToPlainObject(plainObjectToFlattenPathObject([1, 2]))).toThrow(TypeError);
    expect(() => flattenPathObjectToPlainObject({ '': 1 })).toThrow(TypeError);
  });

  it('非规范下标写成对象键', () => {
    expect(flattenPathObjectToPlainObject({ 'a[01]': 5 })).toEqual({ a: { '01': 5 } });
  });

  it('点号数字段建对象、方括号下标建数组，同一路径里可以混用', () => {
    expect(flattenPathObjectToPlainObject({ 'a.0[0]': 'y', 'a.0[1]': 'x' })).toEqual({ a: { '0': ['y', 'x'] } });
  });

  it.each([[{ a: { '0': ['y', 'x'] } }], [{ list: [{ tags: ['t'], meta: { '1': [[], {}] } }] }]])(
    '%o 扁平化后可原样还原',
    object => {
      expect(flattenPathObjectToPlainObject(plainObjectToFlattenPathObject(object))).toEqual(object);
    }
  );
});
