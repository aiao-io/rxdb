/**
 * `usePersistedState` —— React 侧（RVU-010）。
 *
 * @remarks
 * 键转义 / 旧键迁移 / 类型标签 / 写盘失败可观测由 `@aiao/utils` 的 `PersistedStateRegistry`
 * 保证，已在 `packages/utils/src/__tests__/@browser/persisted-state.spec.ts` 逐条锁住。
 * 这里只测 **React 绑定层**：快照是否随外部写入更新、同 key 的两个组件是否互相可见、
 * `setValue` 的 identity 是否稳定。
 *
 * 注册表是模块级单例，用例之间用**互不相同的 namespace** 隔离，
 * 而不是给测试开一个公开的 reset 口子。
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedState } from '../use-persisted-state';

const createMockLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    seed: (key: string, value: string) => {
      store[key] = value;
    }
  };
};

let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
let namespaceCounter = 0;

/** 每个用例一个全新 namespace：模块级注册表在用例之间不重置。 */
const freshNamespace = (): string => `react-spec-${(namespaceCounter += 1)}`;

beforeEach(() => {
  mockLocalStorage = createMockLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
});

afterEach(cleanup);

describe('usePersistedState（RVU-010）', () => {
  it('首次读取使用 initialValue', () => {
    const { result } = renderHook(() => usePersistedState(freshNamespace(), 'theme', 'dark'));

    expect(result.current.value).toBe('dark');
  });

  it('盘上已有值时以盘上值为准', () => {
    const namespace = freshNamespace();
    mockLocalStorage.seed(`${namespace}:theme`, JSON.stringify('light'));

    const { result } = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));

    expect(result.current.value).toBe('light');
  });

  it('setValue 会同步落盘并更新快照', () => {
    const namespace = freshNamespace();
    const { result } = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));

    act(() => result.current.setValue('light'));

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(`${namespace}:theme`, JSON.stringify('light'));
    expect(result.current.value).toBe('light');
  });

  // React 绑定层真正要证明的：不是「值变了」，而是「另一个组件跟着重渲染」
  it('一处写入会让持有同 key 的另一个组件读到新值', () => {
    const namespace = freshNamespace();
    const first = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));
    const second = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));
    expect(second.result.current.value).toBe('dark');

    act(() => first.result.current.setValue('light'));

    expect(second.result.current.value).toBe('light');
  });

  it('同 key 换值类型时 fail-fast', () => {
    const namespace = freshNamespace();
    renderHook(() => usePersistedState(namespace, 'slot', 42));
    // 渲染期抛出会被 React 同时打到 console.error，这里不是被测行为
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => usePersistedState(namespace, 'slot', 'forty-two'))).toThrowError(/slot/);

    consoleError.mockRestore();
  });

  it('组件卸载后同 key 的状态仍然有效，重新挂载读到最新值', () => {
    const namespace = freshNamespace();
    renderHook(() => usePersistedState(namespace, 'theme', 'dark')).unmount();

    const writer = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));
    act(() => writer.result.current.setValue('light'));
    const remounted = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));

    expect(remounted.result.current.value).toBe('light');
  });

  it('setValue 的 identity 跨渲染稳定，可安全进依赖数组', () => {
    const namespace = freshNamespace();
    const { result, rerender } = renderHook(() => usePersistedState(namespace, 'theme', 'dark'));
    const first = result.current.setValue;

    rerender();

    expect(result.current.setValue).toBe(first);
  });

  // useSyncExternalStore 以 subscribe 的 identity 判定是否重订阅：
  // 每次渲染新建一份门面会导致「渲染 → 重订阅 → 渲染」的死循环
  it('重复渲染不会重复订阅（快照稳定，不触发无限重渲染）', () => {
    const namespace = freshNamespace();
    const renderSpy = vi.fn();
    const { result, rerender } = renderHook(() => {
      renderSpy();
      return usePersistedState(namespace, 'theme', 'dark');
    });
    const rendersAfterMount = renderSpy.mock.calls.length;

    rerender();
    act(() => result.current.setValue('light'));

    // 挂载 + 一次显式 rerender + 一次写入，各自最多再触发一次渲染
    expect(renderSpy.mock.calls.length).toBeLessThanOrEqual(rendersAfterMount + 4);
    expect(result.current.value).toBe('light');
  });

  describe('persistError', () => {
    // 注册表的 onError 旁路会把写盘失败打到 console.error，这里是预期行为而非被测行为
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.mocked(console.error).mockRestore();
    });

    it('写盘失败进入 persistError，且内存值照常更新', () => {
      const namespace = freshNamespace();
      const { result } = renderHook(() => usePersistedState(namespace, 'quota', 'a'));
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });

      act(() => result.current.setValue('b'));

      expect(result.current.value).toBe('b');
      expect(result.current.persistError).toBeInstanceOf(Error);
    });

    it('后续写盘成功后 persistError 自动清空', () => {
      const namespace = freshNamespace();
      const { result } = renderHook(() => usePersistedState(namespace, 'quota', 'a'));
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });

      act(() => result.current.setValue('b'));
      act(() => result.current.setValue('c'));

      expect(result.current.persistError).toBeUndefined();
    });

    it('persistError 变化会让持有同 key 的另一个组件重渲染', () => {
      const namespace = freshNamespace();
      const writer = renderHook(() => usePersistedState(namespace, 'shared-error', 'a'));
      const reader = renderHook(() => usePersistedState(namespace, 'shared-error', 'a'));
      expect(reader.result.current.persistError).toBeUndefined();

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });
      act(() => writer.result.current.setValue('b'));

      expect(reader.result.current.persistError).toBeInstanceOf(Error);
    });
  });
});
