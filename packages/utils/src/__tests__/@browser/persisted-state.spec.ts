/**
 * 命名空间持久化状态的框架无关内核（RVU-010）。
 *
 * @remarks
 * `@aiao/rxdb-angular` 的 `useState` 已经把 RAN-005（键不可逆）/ RAN-006（effect 归属）/
 * RAN-010（无校验断言、字面 `'undefined'`、静默写盘失败）逐条修过。Vue/React 补齐等价能力时
 * 若各抄一份，这些结论就有两份独立副本，漂移只是时间问题 ——
 * 因此把「键转义 + 迁移 + 类型标签 + 写盘可观测」上收到这里，只留一份定义。
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PersistedStateRegistry } from '../../@browser/persisted-state.js';

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    snapshot: () => ({ ...store }),
    clear: () => {
      store = {};
    }
  };
};

describe('PersistedStateRegistry', () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
  // 显式签名而不是 ReturnType<typeof vi.fn>：后者是 Mock<Procedure | Constructable>，
  // 接不上 PersistedStateRegistryOptions.onError
  let onError: Mock<(error: unknown) => void>;
  let registry: PersistedStateRegistry;

  // 整份重建而不是 mockClear：用例里有 mockImplementation(() => { throw }) 这种
  // 长效替身，mockClear 只清调用记录、不还原实现，会静默泄漏到后续用例
  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
    onError = vi.fn();
    registry = new PersistedStateRegistry({ onError });
  });

  describe('取值与复用', () => {
    it('首次注册使用 initialValue', () => {
      expect(registry.entry('ns', 'key', 42).get()).toBe(42);
    });

    it('盘上已有值时以盘上值为准', () => {
      mockLocalStorage.setItem('ns:key', JSON.stringify(100));

      expect(registry.entry('ns', 'key', 42).get()).toBe(100);
    });

    it('同 key 始终返回同一个 entry，后续 initialValue 被忽略', () => {
      const first = registry.entry('ns', 'key', 42);
      const second = registry.entry('ns', 'key', 7);

      expect(second).toBe(first);
      expect(second.get()).toBe(42);
    });

    it('不同 key 互相独立', () => {
      const theme = registry.entry('shared', 'theme', 'dark');
      const locale = registry.entry('shared', 'locale', 'zh');
      const other = registry.entry('other', 'theme', 'dark');

      theme.set('light');

      expect(locale.get()).toBe('zh');
      expect(other.get()).toBe('dark');
    });

    it('写入对同 key 的所有持有者可见', () => {
      const first = registry.entry('shared', 'theme', 'dark');
      const second = registry.entry('shared', 'theme', 'dark');

      first.set('light');

      expect(second.get()).toBe('light');
    });
  });

  // RAN-010：`cached as WritableSignal<T>` 是一次无校验断言 —— 同 key 换个泛型 strict TS 两边都过
  describe('类型标签校验', () => {
    it('同 key 换值类型时 fail-fast', () => {
      registry.entry('typed', 'slot', 42);

      expect(() => registry.entry('typed', 'slot', '42')).toThrowError(/typed.*slot/);
    });

    it.each([
      ['null 与对象', null, {}],
      ['数组与对象', [] as unknown, {}],
      ['数字与布尔', 1, true]
    ])('%s 被判为不同类型', (_label, first, second) => {
      registry.entry('typed', 'mixed', first);

      expect(() => registry.entry('typed', 'mixed', second)).toThrowError();
    });

    it('同 key 同类型仍复用', () => {
      const first = registry.entry('typed', 'slot', 42);

      expect(registry.entry('typed', 'slot', 7)).toBe(first);
    });
  });

  // RAN-005：早先 namespace 与 name 直接用 `:` 拼接，映射不可逆
  describe('键转义与迁移', () => {
    it('冒号位置不同即为两份独立状态', () => {
      const left = registry.entry('a:b', 'c', 'left');
      const right = registry.entry('a', 'b:c', 'right');

      expect(right).not.toBe(left);

      left.set('changed');

      expect(right.get()).toBe('right');
    });

    it('两份状态写入不同的盘上键', () => {
      registry.entry('a:b', 'c', 'left');
      registry.entry('a', 'b:c', 'right');

      const stored = mockLocalStorage.snapshot();

      expect(Object.keys(stored)).toHaveLength(2);
      expect(new Set(Object.values(stored))).toEqual(new Set(['"left"', '"right"']));
    });

    it.each([
      ['空 namespace', '', 'x', 'y', ''],
      ['空 name', 'x', '', '', 'y'],
      ['相邻分隔', 'a', ':b', 'a:', 'b'],
      ['百分号', 'a%3A', 'b', 'a', '3A:b'],
      ['Unicode', '命名空间', '键', '命名空间:键', '']
    ])('%s 组合不与其他组合串号', (_label, nsA, nameA, nsB, nameB) => {
      const first = registry.entry(nsA, nameA, 'first');
      const second = registry.entry(nsB, nameB, 'second');

      expect(second).not.toBe(first);
      expect(first.get()).toBe('first');
      expect(second.get()).toBe('second');
    });

    it('不含特殊字符的键沿用旧格式，不产生迁移', () => {
      registry.entry('my-app', 'user-settings', { theme: 'dark' });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('my-app:user-settings', JSON.stringify({ theme: 'dark' }));
      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
    });

    it('含特殊字符的旧键一次性迁移到新键', () => {
      mockLocalStorage.setItem('a:b:c', JSON.stringify('legacy'));

      expect(registry.entry('a:b', 'c', 'fallback').get()).toBe('legacy');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('a:b:c');
      expect(Object.keys(mockLocalStorage.snapshot())).not.toContain('a:b:c');
    });
  });

  // RAN-010：`JSON.stringify(undefined)` 返回 undefined，原样交给 setItem 会在盘上留下字面文本
  describe('序列化契约', () => {
    it('undefined 不写成字面文本，而是移除该键', () => {
      registry.entry('typed', 'maybe', undefined);

      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('typed:maybe', 'undefined');
      expect(Object.keys(mockLocalStorage.snapshot())).not.toContain('typed:maybe');
    });

    it('盘上遗留的字面文本 undefined 按「没存过」处理并清理', () => {
      mockLocalStorage.setItem('typed:legacy', 'undefined');

      expect(registry.entry('typed', 'legacy', 'fallback').get()).toBe('fallback');
      // 不解析、不上报，先把无法 parse 的字面文本删掉
      expect(onError).not.toHaveBeenCalled();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('typed:legacy');
      // 随后初值照常落盘：盘上留下的是合法 JSON，而不是原来那段字面文本
      expect(mockLocalStorage.snapshot()['typed:legacy']).toBe(JSON.stringify('fallback'));
    });

    it('读盘内容无法解析时回退 initialValue 并上报', () => {
      mockLocalStorage.setItem('typed:broken', '{');

      expect(registry.entry('typed', 'broken', 42).get()).toBe(42);
      expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError));
    });
  });

  // RAN-010：写盘失败此前只打一条日志，而值早已更新完毕，调用方看不出数据没落盘
  describe('写盘失败可观测', () => {
    it('失败进入 persistError，成功后自动清空', () => {
      const storageError = new Error('Storage unavailable');
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw storageError;
      });

      const entry = registry.entry('typed', 'observable', 1);

      expect(entry.persistError()).toBe(storageError);

      entry.set(2);

      expect(entry.persistError()).toBeUndefined();
    });

    it('循环引用无法序列化时同样进入 persistError', () => {
      const cyclic: { self?: unknown } = {};
      cyclic.self = cyclic;

      const entry = registry.entry<{ self?: unknown }>('typed', 'cyclic', cyclic);

      expect(entry.persistError()).toBeInstanceOf(TypeError);
      expect(onError).toHaveBeenCalled();
    });

    it('写盘失败不影响内存中的值', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('quota');
      });

      const entry = registry.entry('typed', 'quota', 1);
      entry.set(2);

      expect(entry.get()).toBe(2);
      expect(entry.persistError()).toBeInstanceOf(Error);
    });
  });

  describe('订阅', () => {
    it('set 通知所有订阅者', () => {
      const entry = registry.entry('ns', 'sub', 0);
      const first = vi.fn();
      const second = vi.fn();
      entry.subscribe(first);
      entry.subscribe(second);

      entry.set(1);

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('写盘失败也要通知：persistError 本身就是订阅者要看的变化', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('quota');
      });
      const entry = registry.entry('ns', 'sub-error', 0);
      const listener = vi.fn();
      entry.subscribe(listener);

      entry.set(1);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('退订后不再收到通知', () => {
      const entry = registry.entry('ns', 'sub', 0);
      const listener = vi.fn();
      const unsubscribe = entry.subscribe(listener);

      unsubscribe();
      entry.set(1);

      expect(listener).not.toHaveBeenCalled();
    });

    it('同 key 的另一个持有者写入时也会通知', () => {
      const first = registry.entry('ns', 'shared-sub', 0);
      const second = registry.entry('ns', 'shared-sub', 0);
      const listener = vi.fn();
      first.subscribe(listener);

      second.set(1);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it('两个 registry 实例互不共享内存状态', () => {
    const other = new PersistedStateRegistry({ onError });
    registry.entry('ns', 'isolated', 1).set(9);

    // 盘上仍然共享（同一个 localStorage），但内存注册表是独立的
    expect(other.entry('ns', 'isolated', 1)).not.toBe(registry.entry('ns', 'isolated', 1));
    expect(other.entry('ns', 'isolated', 1).get()).toBe(9);
  });
});
