import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitHostTheme,
  getWujieHost,
  parseResolvedTheme,
  requestHostTheme,
  subscribeHostTheme,
  subscribeThemeRequest,
  WUJIE_THEME_EVENT,
  WUJIE_THEME_REQUEST_EVENT
} from '../host-theme.js';

function createBus() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    $on(event: string, fn: (...args: unknown[]) => void) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(fn);
      listeners.set(event, bucket);
    },
    $off(event: string, fn: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    $emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(listener => listener(...args));
    }
  };
}

describe('host-theme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis as typeof globalThis & { $wujie?: unknown }, '$wujie');
  });

  describe('parseResolvedTheme', () => {
    it.each([
      ['dark', 'dark'],
      ['light', 'light'],
      [{ theme: 'dark' }, 'dark'],
      [{ theme: 'light' }, 'light'],
      [undefined, 'light'],
      [null, 'light'],
      ['auto', 'light'],
      [{ theme: 'AUTO' }, 'light']
    ] as const)('parses %j as %s', (input, expected) => {
      expect(parseResolvedTheme(input)).toBe(expected);
    });
  });

  describe('getWujieHost', () => {
    it('reads $wujie from the provided target', () => {
      const host = { props: { theme: 'dark' } };
      expect(getWujieHost({ $wujie: host })).toBe(host);
    });

    it('falls back to window.$wujie', () => {
      const host = { props: { theme: 'light' } };
      expect(getWujieHost({ window: { $wujie: host } })).toBe(host);
    });

    it('returns undefined when the host is absent', () => {
      expect(getWujieHost({})).toBeUndefined();
    });
  });

  describe('subscribeHostTheme', () => {
    it('applies the initial props theme and later bus events', () => {
      const bus = createBus();
      const onTheme = vi.fn();
      const stop = subscribeHostTheme(onTheme, {
        $wujie: { bus, props: { theme: 'dark' } }
      });

      expect(onTheme).toHaveBeenCalledWith('dark');

      bus.$emit(WUJIE_THEME_EVENT, { theme: 'light' });
      expect(onTheme).toHaveBeenCalledWith('light');

      stop();
      bus.$emit(WUJIE_THEME_EVENT, { theme: 'dark' });
      expect(onTheme).toHaveBeenCalledTimes(2);
    });

    it('falls back to postMessage when the app is not hosted by wujie', () => {
      const listeners = new Map<string, Set<EventListener>>();
      const target = {
        addEventListener(type: string, listener: EventListener) {
          const bucket = listeners.get(type) ?? new Set();
          bucket.add(listener);
          listeners.set(type, bucket);
        },
        removeEventListener(type: string, listener: EventListener) {
          listeners.get(type)?.delete(listener);
        }
      };
      const onTheme = vi.fn();
      const stop = subscribeHostTheme(onTheme, target);

      listeners
        .get('message')
        ?.forEach(listener => listener({ data: { type: 'setTheme', theme: 'dark' } } as MessageEvent));
      expect(onTheme).toHaveBeenCalledWith('dark');

      stop();
      listeners
        .get('message')
        ?.forEach(listener => listener({ data: { type: 'setTheme', theme: 'light' } } as MessageEvent));
      expect(onTheme).toHaveBeenCalledTimes(1);
    });

    it('ignores unrelated postMessage payloads', () => {
      const listeners = new Map<string, Set<EventListener>>();
      const target = {
        addEventListener(type: string, listener: EventListener) {
          const bucket = listeners.get(type) ?? new Set();
          bucket.add(listener);
          listeners.set(type, bucket);
        },
        removeEventListener() {
          /* noop */
        }
      };
      const onTheme = vi.fn();
      subscribeHostTheme(onTheme, target);

      listeners.get('message')?.forEach(listener => listener({ data: { type: 'other' } } as MessageEvent));
      expect(onTheme).not.toHaveBeenCalled();
    });
  });

  describe('emitHostTheme', () => {
    it('emits the namespaced payload on the bus', () => {
      const bus = createBus();
      const onTheme = vi.fn();
      bus.$on(WUJIE_THEME_EVENT, onTheme);

      emitHostTheme(bus, 'dark');
      expect(onTheme).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('is a no-op without a bus', () => {
      expect(() => emitHostTheme(undefined, 'light')).not.toThrow();
    });
  });

  describe('requestHostTheme', () => {
    it('子应用把切换请求发到 $wujie.bus 上', () => {
      const bus = createBus();
      const onRequest = vi.fn();
      bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

      requestHostTheme('dark', { $wujie: { bus } });
      expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('走独立的事件名，不会触发宿主下发通道', () => {
      const bus = createBus();
      const onHostTheme = vi.fn();
      bus.$on(WUJIE_THEME_EVENT, onHostTheme);

      requestHostTheme('dark', { $wujie: { bus } });
      expect(onHostTheme).not.toHaveBeenCalled();
    });

    it('独立运行（没有 $wujie）时静默跳过', () => {
      expect(() => requestHostTheme('dark', {})).not.toThrow();
    });
  });

  describe('subscribeThemeRequest', () => {
    it('宿主收到子应用请求并解析成已解析主题', () => {
      const bus = createBus();
      const onTheme = vi.fn();

      subscribeThemeRequest(onTheme, bus);
      bus.$emit(WUJIE_THEME_REQUEST_EVENT, { theme: 'dark' });
      expect(onTheme).toHaveBeenCalledWith('dark');
    });

    it('退订之后不再收到请求', () => {
      const bus = createBus();
      const onTheme = vi.fn();

      const stop = subscribeThemeRequest(onTheme, bus);
      stop();
      bus.$emit(WUJIE_THEME_REQUEST_EVENT, { theme: 'dark' });
      expect(onTheme).not.toHaveBeenCalled();
    });

    it('没有 bus 时返回可安全调用的退订函数', () => {
      expect(() => subscribeThemeRequest(vi.fn(), undefined)()).not.toThrow();
    });
  });
});
