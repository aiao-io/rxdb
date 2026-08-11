import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../object/deepFreeze.js';

describe('deepFreeze', () => {
  it('freezes nested objects and functions in place', () => {
    const nested = { value: 1 };
    const fn = () => 1;
    Object.defineProperty(fn, 'meta', { value: { ok: true }, writable: true, configurable: true });
    const target = { nested, fn, plain: 2, empty: null as null };

    const frozen = deepFreeze(target);

    expect(frozen).toBe(target);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.fn)).toBe(true);
    expect(Object.isFrozen((frozen.fn as unknown as { meta: object }).meta)).toBe(true);

    expect(() => {
      (frozen as { plain: number }).plain = 3;
    }).toThrow();
  });

  it('returns already frozen objects without re-freezing work', () => {
    const target = Object.freeze({ a: Object.freeze({ b: 1 }) });
    expect(deepFreeze(target)).toBe(target);
  });

  it('递归进入数组、Map、Set 与类实例，而不只是纯对象', () => {
    // 递归 gate 若用 isObject（value.constructor === Object），
    // 数组/Map/Set/类实例的子树会被整体跳过 —— 对外表现为「深冻结」但实际可改。
    class Holder {
      inner = { deep: 1 };
    }
    const target = {
      list: [{ a: 1 }],
      map: new Map([['k', { b: 2 }]]),
      set: new Set([{ c: 3 }]),
      instance: new Holder()
    };

    const frozen = deepFreeze(target);

    expect(Object.isFrozen(frozen.list)).toBe(true);
    expect(Object.isFrozen(frozen.list[0])).toBe(true);
    expect(Object.isFrozen(frozen.map)).toBe(true);
    expect(Object.isFrozen(frozen.set)).toBe(true);
    expect(Object.isFrozen(frozen.instance)).toBe(true);
    expect(Object.isFrozen(frozen.instance.inner)).toBe(true);
  });

  it('顶层数组的元素也被冻结', () => {
    const target: [number, { nested: number }] = [1, { nested: 2 }];

    const frozen = deepFreeze(target);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen[1])).toBe(true);
  });

  it('symbol 键指向的子树也被冻结（UTL-004）', () => {
    // Object.getOwnPropertyNames 不含 symbol —— symbol 键下的整棵子树会被整体跳过。
    const key = Symbol('branch');
    const branch = { deep: { value: 1 } };
    const target = { [key]: branch };

    deepFreeze(target);

    expect(Object.isFrozen(branch)).toBe(true);
    expect(Object.isFrozen(branch.deep)).toBe(true);
  });

  it('下钻 Map 的键与值、Set 的元素（UTL-004）', () => {
    // 容器本身 Object.freeze 后内部槽仍可变，但其中**引用到的对象**必须被冻结，
    // 否则 `frozen.map.get('k').b = 9` 可以直接改掉深层状态。
    const mapKey = { id: 1 };
    const mapValue = { b: { deep: 2 } };
    const setItem = { c: { deep: 3 } };
    const target = {
      map: new Map<object, object>([[mapKey, mapValue]]),
      set: new Set([setItem])
    };

    deepFreeze(target);

    expect(Object.isFrozen(mapKey)).toBe(true);
    expect(Object.isFrozen(mapValue)).toBe(true);
    expect(Object.isFrozen(mapValue.b)).toBe(true);
    expect(Object.isFrozen(setItem)).toBe(true);
    expect(Object.isFrozen(setItem.c)).toBe(true);
  });

  it('Map/Set 的内部槽仍可变，这是已文档化的边界（UTL-004）', () => {
    // Object.freeze 管不到内部槽。返回类型因此只承诺 Readonly<T>，不是 ReadonlyDeep<T>。
    const map = new Map<string, number>();
    const set = new Set<number>();

    const frozen = deepFreeze({ map, set });

    expect(Object.isFrozen(frozen.map)).toBe(true);
    frozen.map.set('a', 1);
    frozen.set.add(1);
    expect(frozen.map.size).toBe(1);
    expect(frozen.set.size).toBe(1);
  });

  it('循环引用不栈溢出', () => {
    // 先递归后冻结会无限下降；先冻结再递归时 Object.isFrozen 提前收敛。
    const target: { self?: unknown } = {};
    target.self = target;

    expect(() => deepFreeze(target)).not.toThrow();
    expect(Object.isFrozen(target)).toBe(true);
  });

  it('互相引用的两个对象同样收敛', () => {
    const left: { peer?: unknown } = {};
    const right: { peer?: unknown } = { peer: left };
    left.peer = right;

    expect(() => deepFreeze(left)).not.toThrow();
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(right)).toBe(true);
  });
});
