import {
  createEnvironmentInjector,
  EnvironmentInjector,
  ErrorHandler,
  provideZonelessChangeDetection,
  runInInjectionContext
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from '../use-state';

describe('useState', () => {
  const errorHandler = { handleError: vi.fn() };
  const mockLocalStorage = (() => {
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
  })();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ErrorHandler, useValue: errorHandler }]
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });
    mockLocalStorage.clear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    errorHandler.handleError.mockReset();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create a signal with initial value', () => {
    TestBed.runInInjectionContext(() => {
      const state = useState('test-namespace')('test-key');
      const testSignal = state.signal(42);

      expect(testSignal()).toBe(42);
    });
  });

  it('should load value from localStorage if exists', () => {
    mockLocalStorage.setItem('test-namespace:test-key', JSON.stringify(100));

    TestBed.runInInjectionContext(() => {
      const state = useState('test-namespace')('test-key');
      const testSignal = state.signal(42);

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test-namespace:test-key');
      expect(testSignal()).toBe(100);
    });
  });

  it('should save value to localStorage on change', async () => {
    TestBed.runInInjectionContext(() => {
      const state = useState('test-namespace')('test-key');
      const testSignal = state.signal(42);

      testSignal.set(100);

      // 等待 effect 运行。
      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test-namespace:test-key', JSON.stringify(100));
    });
  });

  it('should use namespace and name to construct storage key', () => {
    TestBed.runInInjectionContext(() => {
      const state = useState('my-app')('user-settings');
      state.signal({ theme: 'dark' });

      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('my-app:user-settings', JSON.stringify({ theme: 'dark' }));
    });
  });

  it('should handle objects and arrays', async () => {
    TestBed.runInInjectionContext(() => {
      const state = useState('test-namespace')('test-array');
      const testSignal = state.signal([1, 2, 3]);

      testSignal.set([4, 5, 6]);

      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test-namespace:test-array', JSON.stringify([4, 5, 6]));
    });
  });

  it('reports malformed stored state through Angular ErrorHandler', () => {
    mockLocalStorage.setItem('test-namespace:test-key', '{');
    const parseError = TestBed.runInInjectionContext(() => {
      const testSignal = useState('test-namespace')('test-key').signal(42);
      return { testSignal, error: errorHandler.handleError.mock.calls[0]?.[0] };
    });

    expect(parseError.error).toBeInstanceOf(SyntaxError);
    expect(parseError.testSignal()).toBe(42);
  });

  it('reports persistence failures through Angular ErrorHandler', () => {
    const storageError = new Error('Storage unavailable');
    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw storageError;
    });

    TestBed.runInInjectionContext(() => {
      useState('test-namespace')('test-key').signal(42);
      TestBed.flushEffects();
    });

    expect(errorHandler.handleError).toHaveBeenCalledWith(storageError);
  });

  // 文件头承诺「命名空间状态管理」，但每次调用都新建 signal：组件 A/B 互不感知，
  // 且各自的持久化 effect 会用自己那份陈旧值覆盖对方刚写入的盘上数据（last-writer-wins 丢数据）。
  it('returns the same signal for the same namespace:name', () => {
    TestBed.runInInjectionContext(() => {
      const first = useState('shared')('theme').signal('dark');
      const second = useState('shared')('theme').signal('dark');

      expect(second).toBe(first);
    });
  });

  it('propagates writes between call sites sharing a key', () => {
    TestBed.runInInjectionContext(() => {
      const first = useState('shared')('theme').signal('dark');
      const second = useState('shared')('theme').signal('dark');

      first.set('light');

      expect(second()).toBe('light');
    });
  });

  it('keeps different keys independent', () => {
    TestBed.runInInjectionContext(() => {
      const theme = useState('shared')('theme').signal('dark');
      const locale = useState('shared')('locale').signal('zh');
      const otherNamespace = useState('other')('theme').signal('dark');

      theme.set('light');

      expect(locale()).toBe('zh');
      expect(otherNamespace()).toBe('dark');
    });
  });

  it('does not let a stale duplicate overwrite persisted state', () => {
    TestBed.runInInjectionContext(() => {
      const first = useState('shared')('counter').signal(0);
      const second = useState('shared')('counter').signal(0);

      first.set(7);
      TestBed.flushEffects();
      second.set(second() + 1);
      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenLastCalledWith('shared:counter', JSON.stringify(8));
    });
  });

  it('should respect CreateSignalOptions', () => {
    TestBed.runInInjectionContext(() => {
      const equalFn = vi.fn((a: number, b: number) => a === b);
      const state = useState('test-namespace')('test-with-options');
      const testSignal = state.signal(42, { equal: equalFn });

      expect(testSignal()).toBe(42);
    });
  });

  // RAN-005：注册表与 localStorage 键都是 `${namespace}:${name}` 扁平拼接，不可逆。
  // useState('a:b')('c') 与 useState('a')('b:c') 同为 'a:b:c'，后者直接拿到前者的 signal，
  // 任一写入都会篡改另一份业务状态。
  describe('key 隔离（RAN-005）', () => {
    it('冒号在 namespace 与 name 之间的位置不同即为两份独立状态', () => {
      TestBed.runInInjectionContext(() => {
        const left = useState('a:b')('c').signal('left');
        const right = useState('a')('b:c').signal('right');

        expect(right).not.toBe(left);
        expect(left()).toBe('left');
        expect(right()).toBe('right');

        left.set('changed');
        expect(right()).toBe('right');
      });
    });

    it('两份状态写入 localStorage 的键互不覆盖', () => {
      TestBed.runInInjectionContext(() => {
        useState('a:b')('c').signal('left');
        useState('a')('b:c').signal('right');
        TestBed.flushEffects();
      });

      const stored = mockLocalStorage.snapshot();
      const keys = Object.keys(stored);
      expect(keys).toHaveLength(2);
      expect(new Set(Object.values(stored))).toEqual(new Set(['"left"', '"right"']));
    });

    it.each([
      ['空 namespace', '', 'x', 'y', ''],
      ['空 name', 'x', '', '', 'y'],
      ['相邻分隔', 'a', ':b', 'a:', 'b'],
      ['Unicode', '命名空间', '键', '命名空间:键', '']
    ])('%s 组合不与其他组合串号', (_label, nsA, nameA, nsB, nameB) => {
      TestBed.runInInjectionContext(() => {
        const first = useState(nsA)(nameA).signal('first');
        const second = useState(nsB)(nameB).signal('second');

        expect(second).not.toBe(first);
        expect(first()).toBe('first');
        expect(second()).toBe('second');
      });
    });

    it('不含特殊字符的键沿用旧格式，不产生迁移', () => {
      TestBed.runInInjectionContext(() => {
        useState('my-app')('user-settings').signal({ theme: 'dark' });
        TestBed.flushEffects();
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('my-app:user-settings', JSON.stringify({ theme: 'dark' }));
      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
    });

    it('含特殊字符的旧键一次性迁移到新键', () => {
      mockLocalStorage.setItem('a:b:c', JSON.stringify('legacy'));
      mockLocalStorage.setItem.mockClear();

      const value = TestBed.runInInjectionContext(() => useState('a:b')('c').signal('fallback')());

      expect(value).toBe('legacy');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('a:b:c');
      expect(Object.keys(mockLocalStorage.snapshot())).not.toContain('a:b:c');
    });
  });

  // RAN-006：signal 缓存在 root 的 StateRegistry 上，持久化 effect 却绑在
  // 首个调用点的 EnvironmentInjector 上。lazy route 的 child injector 一销毁，
  // effect 随之销毁，而后续同 key 调用命中 cached 分支不会重建 —— 从此永不写盘。
  describe('持久化 effect 归属（RAN-006）', () => {
    const createChildInjector = () => createEnvironmentInjector([], TestBed.inject(EnvironmentInjector), 'lazy-route');

    it('首个调用点的 child injector 销毁后仍继续持久化', () => {
      const child = createChildInjector();
      const counter = runInInjectionContext(child, () => useState('lazy')('counter').signal(0));

      TestBed.flushEffects();
      child.destroy();
      mockLocalStorage.setItem.mockClear();

      counter.set(7);
      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('lazy:counter', JSON.stringify(7));
    });

    it('child injector 销毁后从 root 复用同一 signal 且写盘不中断', () => {
      const child = createChildInjector();
      const first = runInInjectionContext(child, () => useState('lazy')('theme').signal('dark'));
      TestBed.flushEffects();
      child.destroy();

      const second = TestBed.runInInjectionContext(() => useState('lazy')('theme').signal('dark'));
      expect(second).toBe(first);

      mockLocalStorage.setItem.mockClear();
      second.set('light');
      TestBed.flushEffects();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('lazy:theme', JSON.stringify('light'));
    });
  });

  // RAN-010：`cached as WritableSignal<T>` 是一次无校验断言 —— 同 key 换个泛型
  // strict TS 两边都过；JSON 往返承诺同样是空的，undefined 会被写成无法 parse 的
  // 字面文本 'undefined'，而写盘失败只进 ErrorHandler，调用方从返回值上看不出来。
  describe('类型与持久化契约（RAN-010）', () => {
    it('同 key 换值类型时 fail-fast，而不是静默断言', () => {
      TestBed.runInInjectionContext(() => {
        useState('typed')('slot').signal(42);

        expect(() => useState('typed')('slot').signal('42')).toThrowError(/typed.*slot/);
      });
    });

    it('同 key 同类型仍复用，不受类型校验影响', () => {
      TestBed.runInInjectionContext(() => {
        const first = useState('typed')('slot').signal(42);
        const second = useState('typed')('slot').signal(7);

        expect(second).toBe(first);
        expect(second()).toBe(42);
      });
    });

    it('undefined 不写成字面文本 undefined，而是移除该键', () => {
      TestBed.runInInjectionContext(() => {
        useState('typed')('maybe').signal<string | undefined>(undefined);
        TestBed.flushEffects();
      });

      expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith('typed:maybe', 'undefined');
      expect(Object.keys(mockLocalStorage.snapshot())).not.toContain('typed:maybe');
    });

    it('盘上遗留的字面文本 undefined 按「没存过」处理并清理', () => {
      mockLocalStorage.setItem('typed:legacy', 'undefined');

      const value = TestBed.runInInjectionContext(() => useState('typed')('legacy').signal('fallback')());

      expect(value).toBe('fallback');
      expect(errorHandler.handleError).not.toHaveBeenCalled();
      expect(Object.keys(mockLocalStorage.snapshot())).not.toContain('typed:legacy');
    });

    it('持久化失败进入可观察状态，成功后自动清空', () => {
      const storageError = new Error('Storage unavailable');
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw storageError;
      });

      TestBed.runInInjectionContext(() => {
        const state = useState('typed')('observable');
        const counter = state.signal(1);
        TestBed.flushEffects();

        expect(state.persistError()).toBe(storageError);

        counter.set(2);
        TestBed.flushEffects();

        expect(state.persistError()).toBeUndefined();
      });
    });

    it('循环引用无法序列化时同样进入可观察状态', () => {
      TestBed.runInInjectionContext(() => {
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        const state = useState('typed')('cyclic');
        state.signal<{ self?: unknown }>(cyclic);
        TestBed.flushEffects();

        expect(state.persistError()).toBeInstanceOf(TypeError);
        expect(errorHandler.handleError).toHaveBeenCalled();
      });
    });
  });
});
