import { describe, expect, it } from 'vitest';
import { get } from '../../object/get.js';
import { set } from '../../object/set.js';

describe('set', () => {
  it('1', () => {
    const object = { a: [{ b: [{ d: [1] }] }] };
    set(object, 'a[0].b[0].d[0]', 2);
    expect(get(object, 'a[0].b[0].d[0]')).toEqual(2);
  });
  it('2', () => {
    const object = { a: [{ b: { c: 1 } }] };
    set(object, 'a[0].b.c', 2);
    expect(get(object, 'a[0].b.c')).toEqual(2);
  });
});

it('rejects prototype-polluting paths', () => {
  expect(() => set({}, '__proto__.polluted', true)).toThrow(TypeError);
  expect(() => set({}, 'constructor.prototype.polluted', true)).toThrow(TypeError);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

it('replaces primitive intermediate values with containers', () => {
  expect(set({ a: 1 }, 'a.b', 2)).toEqual({ a: { b: 2 } });
});

// UTL-023：Reflect.set 返回 false（冻结 / writable:false / setter 拒绝）时
// 原实现忽略返回值继续走，最终 return object，调用方以为写成功了。
describe('UTL-023 写入被拒必须抛错', () => {
  it('冻结对象上写入抛 TypeError', () => {
    const frozen = Object.freeze({ a: 1 });
    expect(() => set(frozen as { a: number }, 'a', 2)).toThrow(TypeError);
  });

  it('writable:false 属性抛 TypeError 且带路径信息', () => {
    const target = {};
    Object.defineProperty(target, 'locked', { value: 1, writable: false, enumerable: true });
    expect(() => set(target, 'locked', 2)).toThrow(/locked/);
  });

  it('中间容器所在对象被冻结时同样抛错', () => {
    const frozen = Object.freeze({} as Record<string, unknown>);
    expect(() => set(frozen, 'a.b', 1)).toThrow(TypeError);
  });

  it('正常写入不受影响', () => {
    expect(set({ a: 1 }, 'a', 2)).toEqual({ a: 2 });
    expect(set({} as Record<string, unknown>, 'a.b', 1)).toEqual({ a: { b: 1 } });
  });
});

// 容器推断曾用 `/^\d+$/`：`01` 这类非规范下标也建数组，随后却作为普通属性写入——
// 数组长度仍为 0，JSON 序列化看不见，值被静默藏起来。
describe('只有规范数组下标才创建数组', () => {
  it('前导零下标创建对象', () => {
    const result = set({} as Record<string, unknown>, 'a[01]', 5);

    expect(Array.isArray(result['a'])).toBe(false);
    expect(result).toEqual({ a: { '01': 5 } });
  });

  it('超出数组下标上限（2^32 - 2）的数字创建对象', () => {
    const result = set({} as Record<string, unknown>, 'a[4294967295]', 1);

    expect(Array.isArray(result['a'])).toBe(false);
    expect(result).toEqual({ a: { '4294967295': 1 } });
  });

  it('规范下标照旧创建数组', () => {
    expect(set({} as Record<string, unknown>, 'a[0]', 1)).toEqual({ a: [1] });

    const nested = set({} as Record<string, unknown>, 'a.2.b', 1);
    expect(Array.isArray(nested['a'])).toBe(true);
    expect(nested['a']).toHaveLength(3);
  });
});
