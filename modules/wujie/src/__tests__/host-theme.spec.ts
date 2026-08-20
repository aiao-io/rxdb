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
import { createFakeWujieBus } from '../testing/index.js';

const SCOPE_ORIGIN = 'https://docs.example';

/** 假 window：只提供 message 订阅面与 `location.origin`，用来驱动 postMessage 兼容通道。 */
function createMessageTarget(location: object = { origin: SCOPE_ORIGIN }) {
  const listeners = new Map<string, Set<EventListener>>();
  const target = {
    location,
    addEventListener(type: string, listener: EventListener) {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    }
  };
  const dispatch = (event: Partial<MessageEvent>) =>
    listeners.get('message')?.forEach(listener => listener(event as MessageEvent));
  return { target, listeners, dispatch };
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
      const bus = createFakeWujieBus();
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

    it('宿主只给 props 没给可用 bus 时，初始主题照样生效', () => {
      const onTheme = vi.fn();

      // 无界注入 $wujie 与 bus 之间存在时间差，早于 bus 就绪挂载的子应用会走到这条路径。
      const stop = subscribeHostTheme(onTheme, { $wujie: { props: { theme: 'dark' } } });
      expect(onTheme).toHaveBeenCalledWith('dark');
      expect(() => stop()).not.toThrow();

      // bus 只有 $emit 没有 $on（旧版本无界）时同样不该炸，也不该退回 postMessage 通道
      const emitOnly = { $emit: vi.fn() };
      onTheme.mockClear();
      expect(() =>
        subscribeHostTheme(onTheme, { $wujie: { bus: emitOnly, props: { theme: 'light' } } })()
      ).not.toThrow();
      expect(onTheme).toHaveBeenCalledExactlyOnceWith('light');
    });

    it('falls back to postMessage when the app is not hosted by wujie', () => {
      const { target, dispatch } = createMessageTarget();
      const onTheme = vi.fn();
      const stop = subscribeHostTheme(onTheme, target);

      dispatch({ origin: SCOPE_ORIGIN, data: { type: 'setTheme', theme: 'dark' } });
      expect(onTheme).toHaveBeenCalledWith('dark');

      stop();
      dispatch({ origin: SCOPE_ORIGIN, data: { type: 'setTheme', theme: 'light' } });
      expect(onTheme).toHaveBeenCalledTimes(1);
    });

    it('ignores unrelated postMessage payloads', () => {
      const { target, dispatch } = createMessageTarget();
      const onTheme = vi.fn();
      subscribeHostTheme(onTheme, target);

      dispatch({ origin: SCOPE_ORIGIN, data: { type: 'other' } });
      expect(onTheme).not.toHaveBeenCalled();
    });

    it('丢弃跨域窗口发来的 setTheme', () => {
      const { target, dispatch } = createMessageTarget();
      const onTheme = vi.fn();
      subscribeHostTheme(onTheme, target);

      dispatch({ origin: 'https://evil.example', data: { type: 'setTheme', theme: 'dark' } });
      expect(onTheme).not.toHaveBeenCalled();
    });

    it('丢弃空 origin（sandboxed iframe / data: 文档）发来的 setTheme', () => {
      const { target, dispatch } = createMessageTarget();
      const onTheme = vi.fn();
      subscribeHostTheme(onTheme, target);

      dispatch({ origin: '', data: { type: 'setTheme', theme: 'dark' } });
      expect(onTheme).not.toHaveBeenCalled();
    });

    it('拿不到自身 origin 时根本不订阅 message', () => {
      const { target, listeners } = createMessageTarget({});
      const onTheme = vi.fn();

      expect(() => subscribeHostTheme(onTheme, target)()).not.toThrow();
      expect(listeners.get('message')).toBeUndefined();
    });
  });

  describe('emitHostTheme', () => {
    it('emits the namespaced payload on the bus', () => {
      const bus = createFakeWujieBus();
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
      const bus = createFakeWujieBus();
      const onRequest = vi.fn();
      bus.$on(WUJIE_THEME_REQUEST_EVENT, onRequest);

      requestHostTheme('dark', { $wujie: { bus } });
      expect(onRequest).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('走独立的事件名，不会触发宿主下发通道', () => {
      const bus = createFakeWujieBus();
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
      const bus = createFakeWujieBus();
      const onTheme = vi.fn();

      subscribeThemeRequest(onTheme, bus);
      bus.$emit(WUJIE_THEME_REQUEST_EVENT, { theme: 'dark' });
      expect(onTheme).toHaveBeenCalledWith('dark');
    });

    it('退订之后不再收到请求', () => {
      const bus = createFakeWujieBus();
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
