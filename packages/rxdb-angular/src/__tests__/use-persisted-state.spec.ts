/**
 * `usePersistedState` —— Angular 侧（RVU-010）。
 *
 * @remarks
 * 这是 {@link useState} 的**扁平签名适配**，不是第二套持久化实现：键转义、旧键迁移、
 * 类型标签、写盘失败可观测都仍由 `StateRegistry` 负责，已在 `use-state.spec.ts` 逐条锁住。
 * 这里只测适配层该负责的部分 —— 三端同一个 `(namespace, name, initialValue)` 签名、
 * 同 key 共享同一个 signal、`persistError` 与 `useState` 通路完全一致。
 *
 * 扁平签名存在的理由：React 的 hooks 规则不允许 `useState(ns)(name).signal(init)` 这种
 * 「从返回对象的方法里再调 hook」的形态，三端要有同一个签名就只能拉平。
 */
import { ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedState } from '../use-persisted-state';
import { useState } from '../use-state';

describe('usePersistedState（RVU-010）', () => {
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
      clear: () => {
        store = {};
      }
    };
  })();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ErrorHandler, useValue: errorHandler }]
    });
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
    mockLocalStorage.clear();
    mockLocalStorage.getItem.mockClear();
    // mockClear 不会还原 mockImplementationOnce 之外的实现，写盘失败用例一律用 Once
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    errorHandler.handleError.mockReset();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('首次读取使用 initialValue', () => {
    TestBed.runInInjectionContext(() => {
      expect(usePersistedState('app', 'theme', 'dark').value()).toBe('dark');
    });
  });

  it('盘上已有值时以盘上值为准', () => {
    mockLocalStorage.setItem('app:theme', JSON.stringify('light'));

    TestBed.runInInjectionContext(() => {
      expect(usePersistedState('app', 'theme', 'dark').value()).toBe('light');
    });
  });

  it('写入 signal 会落盘', () => {
    TestBed.runInInjectionContext(() => {
      const state = usePersistedState('app', 'theme', 'dark');

      state.value.set('light');
      TestBed.tick();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('app:theme', JSON.stringify('light'));
    });
  });

  // 适配层不得另起炉灶：必须命中 useState 那张注册表，否则就是第二份互不感知的状态
  it('与 useState 同 key 时共享同一个 signal', () => {
    TestBed.runInInjectionContext(() => {
      const flat = usePersistedState('app', 'theme', 'dark');
      const curried = useState('app')('theme').signal('dark');

      expect(flat.value).toBe(curried);
    });
  });

  it('同 key 的两次调用返回同一个 signal', () => {
    TestBed.runInInjectionContext(() => {
      expect(usePersistedState('app', 'theme', 'dark').value).toBe(usePersistedState('app', 'theme', 'dark').value);
    });
  });

  it('同 key 换值类型时 fail-fast', () => {
    TestBed.runInInjectionContext(() => {
      usePersistedState('app', 'slot', 42);

      expect(() => usePersistedState('app', 'slot', 'forty-two')).toThrowError(/slot/);
    });
  });

  it('namespace 与 name 各自转义，不会互相串号', () => {
    TestBed.runInInjectionContext(() => {
      const left = usePersistedState('a:b', 'c', 'left');
      const right = usePersistedState('a', 'b:c', 'right');

      left.value.set('changed');
      TestBed.tick();

      expect(right.value()).toBe('right');
    });
  });

  describe('persistError', () => {
    it('初始为 undefined', () => {
      TestBed.runInInjectionContext(() => {
        expect(usePersistedState('app', 'ok', 'a').persistError()).toBeUndefined();
      });
    });

    it('写盘失败进入 persistError，且 signal 值照常更新', () => {
      TestBed.runInInjectionContext(() => {
        const state = usePersistedState('app', 'quota', 'a');
        TestBed.tick();
        mockLocalStorage.setItem.mockImplementationOnce(() => {
          throw new Error('QuotaExceeded');
        });

        state.value.set('b');
        TestBed.tick();

        expect(state.value()).toBe('b');
        expect(state.persistError()).toBeInstanceOf(Error);
      });
    });

    it('与 useState 通路共享同一个 persistError', () => {
      TestBed.runInInjectionContext(() => {
        const flat = usePersistedState('app', 'quota', 'a');
        TestBed.tick();
        mockLocalStorage.setItem.mockImplementationOnce(() => {
          throw new Error('QuotaExceeded');
        });

        flat.value.set('b');
        TestBed.tick();

        expect(useState('app')('quota').persistError()).toBe(flat.persistError());
      });
    });
  });
});
