import { describe, expect, it, vi } from 'vitest';
import {
  bindWujieRoute,
  emitHostRoute,
  getWujieAppId,
  HostRouteSync,
  normalizeRoutePath,
  reportSubRoute,
  subscribeHostRoute,
  subscribeSubRoute,
  WUJIE_ROUTE_CHANGE_EVENT,
  WUJIE_ROUTE_EVENT,
  type WujieRouteAdapter
} from '../host-route.js';
import { createFakeWujieBus, type FakeWujieBus } from '../testing/index.js';

/** 模拟子应用侧的沙箱 window：`$wujie` 由无界注入，`__WUJIE.id` 即宿主给的 name。 */
function createSubWindow(bus: FakeWujieBus, id = 'rxdb-demo-vue', props: Record<string, unknown> = {}) {
  return { $wujie: { bus, props }, __WUJIE: { id } };
}

/** 记录 navigate 调用、并允许手工触发子应用自身的路由变化。 */
function createAdapter() {
  const navigate = vi.fn<(path: string, replace: boolean) => void>();
  const unsubscribe = vi.fn();
  let emitChange: ((path: string) => void) | undefined;

  const adapter: WujieRouteAdapter = {
    navigate,
    subscribe(onChange) {
      emitChange = onChange;
      return unsubscribe;
    }
  };

  return {
    adapter,
    navigate,
    unsubscribe,
    /** 子应用侧路由变化；`subscribe` 未注册时返回 false，用于断言时序 */
    change(path: string): boolean {
      if (!emitChange) return false;
      emitChange(path);
      return true;
    },
    get subscribed(): boolean {
      return Boolean(emitChange);
    }
  };
}

describe('host-route', () => {
  describe('normalizeRoutePath', () => {
    it.each([
      ['/todo', '/todo'],
      ['todo', '/todo'],
      ['/todo/', '/todo'],
      ['/', '/'],
      ['', '/'],
      ['/todo?page=2', '/todo'],
      ['/todo#anchor', '/todo'],
      ['/todo/?page=2#a', '/todo'],
      [undefined, '/'],
      [null, '/'],
      [42, '/']
    ] as const)('normalizes %j to %s', (input, expected) => {
      expect(normalizeRoutePath(input)).toBe(expected);
    });
  });

  describe('getWujieAppId', () => {
    it('读子应用沙箱里无界注入的 __WUJIE.id', () => {
      expect(getWujieAppId({ __WUJIE: { id: 'rxdb-demo-react' } })).toBe('rxdb-demo-react');
    });

    it('兼容嵌套的 window', () => {
      expect(getWujieAppId({ window: { __WUJIE: { id: 'rxdb-demo-vue' } } })).toBe('rxdb-demo-vue');
    });

    it('独立运行时拿不到 id', () => {
      expect(getWujieAppId({})).toBeUndefined();
    });
  });

  describe('emitHostRoute', () => {
    it('宿主把归一化后的期望路径带 name 发到 bus 上', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();
      bus.$on(WUJIE_ROUTE_EVENT, onRoute);

      emitHostRoute(bus, 'rxdb-demo-vue', 'todo/');
      expect(onRoute).toHaveBeenCalledWith({ name: 'rxdb-demo-vue', path: '/todo' });
    });

    it('没有 bus 时静默跳过', () => {
      expect(() => emitHostRoute(undefined, 'rxdb-demo-vue', '/todo')).not.toThrow();
    });
  });

  describe('subscribeSubRoute', () => {
    it('宿主收到同名子应用的回传', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();

      subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      bus.$emit(WUJIE_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-vue', path: '/todo?x=1' });
      expect(onRoute).toHaveBeenCalledWith('/todo');
    });

    it('同屏多子应用时丢掉别人的回传', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();

      subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      bus.$emit(WUJIE_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-react', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('退订之后不再收到回传', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();

      const stop = subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      stop();
      bus.$emit(WUJIE_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-vue', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('没有 bus 时返回可安全调用的退订函数', () => {
      expect(() => subscribeSubRoute('rxdb-demo-vue', vi.fn(), undefined)()).not.toThrow();
    });
  });

  describe('subscribeHostRoute', () => {
    it('先应用 props.route，再听 bus 上的后续下发', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();
      const stop = subscribeHostRoute(onRoute, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));

      expect(onRoute).toHaveBeenCalledWith('/todo');

      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      expect(onRoute).toHaveBeenLastCalledWith('/search');

      stop();
      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/home' });
      expect(onRoute).toHaveBeenCalledTimes(2);
    });

    it('props 上没有 route 时不给初始值', () => {
      const onRoute = vi.fn();
      subscribeHostRoute(onRoute, createSubWindow(createFakeWujieBus()));
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('丢掉发给别的子应用的下发', () => {
      const bus = createFakeWujieBus();
      const onRoute = vi.fn();
      subscribeHostRoute(onRoute, createSubWindow(bus, 'rxdb-demo-vue'));

      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-react', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('独立运行（没有 $wujie）时返回可安全调用的退订函数', () => {
      const onRoute = vi.fn();
      expect(() => subscribeHostRoute(onRoute, {})()).not.toThrow();
      expect(onRoute).not.toHaveBeenCalled();
    });
  });

  describe('reportSubRoute', () => {
    it('子应用带自己的 __WUJIE.id 上报归一化路径', () => {
      const bus = createFakeWujieBus();
      const onChange = vi.fn();
      bus.$on(WUJIE_ROUTE_CHANGE_EVENT, onChange);

      reportSubRoute('todo?x=1', createSubWindow(bus, 'rxdb-demo-angular'));
      expect(onChange).toHaveBeenCalledWith({ name: 'rxdb-demo-angular', path: '/todo' });
    });

    it('走独立事件名，不会触发宿主下发通道', () => {
      const bus = createFakeWujieBus();
      const onHostRoute = vi.fn();
      bus.$on(WUJIE_ROUTE_EVENT, onHostRoute);

      reportSubRoute('/todo', createSubWindow(bus));
      expect(onHostRoute).not.toHaveBeenCalled();
    });

    it('独立运行时静默跳过', () => {
      expect(() => reportSubRoute('/todo', {})).not.toThrow();
    });
  });

  describe('HostRouteSync', () => {
    it('没有待确认路径时一律采纳', () => {
      expect(new HostRouteSync().accept('/todo')).toBe(true);
    });

    it('期望路径未到位时丢掉子应用首屏的回弹', () => {
      const sync = new HostRouteSync({ ttlMs: 600, now: () => 0 });
      sync.expect('/todo');
      expect(sync.accept('/home')).toBe(false);
    });

    it('命中期望路径后解锁，后续用户导航正常回写', () => {
      const sync = new HostRouteSync({ ttlMs: 600, now: () => 0 });
      sync.expect('/todo');

      expect(sync.accept('/todo/')).toBe(true);
      expect(sync.accept('/search')).toBe(true);
    });

    it('期望路径永远到不了时靠 TTL 兜底解锁，不会锁死', () => {
      let clock = 0;
      const sync = new HostRouteSync({ ttlMs: 600, now: () => clock });
      sync.expect('/not-a-route');

      expect(sync.accept('/home')).toBe(false);
      clock = 601;
      expect(sync.accept('/home')).toBe(true);
      expect(sync.accept('/search')).toBe(true);
    });
  });

  describe('bindWujieRoute', () => {
    it('先消化宿主初始路径，再注册上报 —— 首屏不会误报', () => {
      const bus = createFakeWujieBus();
      const reported = vi.fn();
      bus.$on(WUJIE_ROUTE_CHANGE_EVENT, reported);
      const target = createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' });
      const io = createAdapter();

      let subscribedAtNavigate = true;
      io.navigate.mockImplementation(() => {
        subscribedAtNavigate = io.subscribed;
      });

      bindWujieRoute(io.adapter, target);

      expect(io.navigate).toHaveBeenCalledWith('/todo', true);
      expect(subscribedAtNavigate).toBe(false);
      expect(reported).not.toHaveBeenCalled();
    });

    it('子应用自身导航回写宿主', () => {
      const bus = createFakeWujieBus();
      const reported = vi.fn();
      bus.$on(WUJIE_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      io.change('/search?q=1');

      expect(reported).toHaveBeenCalledWith({ name: 'rxdb-demo-vue', path: '/search' });
    });

    it('宿主后续下发走 push 语义', () => {
      const bus = createFakeWujieBus();
      const io = createAdapter();

      bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));
      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });

      expect(io.navigate).toHaveBeenLastCalledWith('/search', false);
    });

    it('宿主下发引起的路由变化不再回传，避免绕成回环', () => {
      const bus = createFakeWujieBus();
      const reported = vi.fn();
      bus.$on(WUJIE_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      io.change('/search');

      expect(reported).not.toHaveBeenCalled();
    });

    it('路径没变时不重复下发导航', () => {
      const bus = createFakeWujieBus();
      const io = createAdapter();

      bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));
      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/todo' });

      expect(io.navigate).toHaveBeenCalledTimes(1);
    });

    it('独立运行时完全不接线', () => {
      const io = createAdapter();
      const stop = bindWujieRoute(io.adapter, {});

      expect(io.subscribed).toBe(false);
      expect(io.navigate).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    });

    it('退订同时摘掉两个方向', () => {
      const bus = createFakeWujieBus();
      const reported = vi.fn();
      bus.$on(WUJIE_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      const stop = bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      stop();

      expect(io.unsubscribe).toHaveBeenCalled();
      bus.$emit(WUJIE_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      expect(io.navigate).not.toHaveBeenCalled();
    });
  });
});
