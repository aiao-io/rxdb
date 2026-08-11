import { describe, expect, it, vi } from 'vitest';
import { createOptionsKey, resolveOptions, resolveOptionsWithKey, toError } from '../query-options';

describe('createOptionsKey', () => {
  it('distinguishes primitive values and numeric edge cases', () => {
    const values = [null, undefined, 'value', true, false, 0, -0, 42, 1n];
    const keys = values.map(createOptionsKey);

    expect(new Set(keys)).toHaveLength(values.length);
    expect(createOptionsKey('value')).toBe(createOptionsKey('value'));
  });

  it('stabilizes object key order, nested arrays, dates, and shared references', () => {
    const shared = { active: true };
    const first = {
      requestedAt: new Date('2026-01-02T03:04:05.000Z'),
      filters: [shared, { count: 2 }],
      shared
    };
    const second = {
      shared: { active: true },
      filters: [{ active: true }, { count: 2 }],
      requestedAt: new Date('2026-01-02T03:04:05.000Z')
    };

    expect(createOptionsKey(first)).toBe(createOptionsKey(second));
    expect(createOptionsKey([1, 2])).not.toBe(createOptionsKey([2, 1]));
  });

  it.each([
    ['function', { value: () => 'invalid' }],
    ['symbol', { value: Symbol('invalid') }]
  ])('rejects %s values', (_name, options) => {
    expect(() => createOptionsKey(options)).toThrow(
      new TypeError('RxDB query options must contain serializable values')
    );
  });

  it('rejects circular references', () => {
    const options: { self?: unknown } = {};
    options.self = options;

    expect(() => createOptionsKey(options)).toThrow(
      new TypeError('RxDB query options must not contain circular references')
    );
  });

  // Object.keys(new Map([['a',1]])) / new Set([1]) / /foo/g 全是 []，兜底的 plain-object
  // 分支会把它们统统坍缩成 "object:{}"：任意两个 Map/Set/RegExp 的 key 恒等，
  // 用户改了筛选条件 → optionsKey 不变 → useEffect 依赖不变 → 旧订阅不取消、新查询不发起。
  it('distinguishes Map values by entries', () => {
    expect(createOptionsKey(new Map([['a', 1]]))).not.toBe(createOptionsKey(new Map([['a', 2]])));
    expect(createOptionsKey(new Map([['a', 1]]))).toBe(createOptionsKey(new Map([['a', 1]])));
    // 键序不影响
    expect(
      createOptionsKey(
        new Map([
          ['b', 2],
          ['a', 1]
        ])
      )
    ).toBe(
      createOptionsKey(
        new Map([
          ['a', 1],
          ['b', 2]
        ])
      )
    );
  });

  it('distinguishes Set values by members', () => {
    expect(createOptionsKey(new Set([1, 2]))).not.toBe(createOptionsKey(new Set([1, 3])));
    expect(createOptionsKey(new Set([1, 2]))).toBe(createOptionsKey(new Set([2, 1])));
  });

  it('distinguishes RegExp values by source and flags', () => {
    expect(createOptionsKey(/foo/g)).not.toBe(createOptionsKey(/bar/g));
    expect(createOptionsKey(/foo/g)).not.toBe(createOptionsKey(/foo/i));
    expect(createOptionsKey(/foo/g)).toBe(createOptionsKey(/foo/g));
  });

  it('keeps Map, Set, RegExp and plain object keys mutually distinct', () => {
    const keys = [
      createOptionsKey(new Map()),
      createOptionsKey(new Set()),
      createOptionsKey(/(?:)/),
      createOptionsKey({})
    ];

    expect(new Set(keys)).toHaveLength(keys.length);
  });

  // 无法识别的宿主对象继续走 plain-object 兜底 = 静默降级，与本模块对 function/symbol
  // 的「显式抛错」策略自相矛盾，也违反「无 fallback 兜底」铁律。
  it('rejects unrecognized host objects instead of silently collapsing them', () => {
    expect(() => createOptionsKey(new WeakMap())).toThrow(TypeError);
    expect(() => createOptionsKey(new ArrayBuffer(8))).toThrow(TypeError);
  });
});

describe('resolveOptions', () => {
  it('returns direct values unchanged', () => {
    const options = { key: 'direct' };

    expect(resolveOptions(options)).toBe(options);
  });

  it('evaluates option factories', () => {
    const options = { key: 'factory' };
    const factory = vi.fn(() => options);

    expect(resolveOptions(factory)).toBe(options);
    expect(factory).toHaveBeenCalledOnce();
  });
});

describe('resolveOptionsWithKey', () => {
  it('accepts factories that return structurally equal fresh values', () => {
    const factory = vi.fn(() => ({ key: 'stable', requestedAt: new Date('2026-01-02T03:04:05.000Z') }));

    expect(resolveOptionsWithKey(factory)).toEqual({
      value: { key: 'stable', requestedAt: new Date('2026-01-02T03:04:05.000Z') },
      key: createOptionsKey({ key: 'stable', requestedAt: new Date('2026-01-02T03:04:05.000Z') })
    });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('rejects factories that change value during one render', () => {
    let offset = 0;

    expect(() => resolveOptionsWithKey(() => ({ offset: offset++ }))).toThrow(
      new TypeError('RxDB query options factory must return a stable value during one render')
    );
  });
});

describe('toError', () => {
  it('preserves Error instances', () => {
    const error = new Error('failure');

    expect(toError(error)).toBe(error);
  });

  it('normalizes non-Error causes', () => {
    expect(toError('failure')).toEqual(new Error('failure'));
  });
});
