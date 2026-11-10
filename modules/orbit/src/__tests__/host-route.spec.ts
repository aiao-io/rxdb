import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindOrbitRoute,
  emitHostRoute,
  getOrbitAppId,
  HostRouteSync,
  normalizeRoutePath,
  ORBIT_ROUTE_CHANGE_EVENT,
  ORBIT_ROUTE_EVENT,
  reportSubRoute,
  subscribeHostRoute,
  subscribeSubRoute,
  type OrbitRouteAdapter
} from '../host-route.js';
import { createFakeOrbitBus, type FakeOrbitBus } from '../testing/index.js';

/** 模拟子应用侧的沙箱 window：`$orbit` 由Orbit 注入，`__ORBIT.id` 即宿主给的 name。 */
function createSubWindow(bus: FakeOrbitBus, id = 'rxdb-demo-vue', props: Record<string, unknown> = {}) {
  return { $orbit: { bus, props }, __ORBIT: { id } };
}

/** 记录 navigate 调用、并允许手工触发子应用自身的路由变化。 */
function createAdapter() {
  const navigate = vi.fn<(path: string, replace: boolean) => void>();
  const unsubscribe = vi.fn();
  let emitChange: ((path: string) => void) | undefined;

  const adapter: OrbitRouteAdapter = {
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

  describe('getOrbitAppId', () => {
    it('读子应用沙箱里Orbit 注入的 __ORBIT.id', () => {
      expect(getOrbitAppId({ __ORBIT: { id: 'rxdb-demo-react' } })).toBe('rxdb-demo-react');
    });

    it('兼容嵌套的 window', () => {
      expect(getOrbitAppId({ window: { __ORBIT: { id: 'rxdb-demo-vue' } } })).toBe('rxdb-demo-vue');
    });

    it('独立运行时拿不到 id', () => {
      expect(getOrbitAppId({})).toBeUndefined();
    });
  });

  describe('emitHostRoute', () => {
    it('宿主把归一化后的期望路径带 name 发到 bus 上', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();
      bus.$on(ORBIT_ROUTE_EVENT, onRoute);

      emitHostRoute(bus, 'rxdb-demo-vue', 'todo/');
      expect(onRoute).toHaveBeenCalledWith({ name: 'rxdb-demo-vue', path: '/todo' });
    });

    it('没有 bus 时静默跳过', () => {
      expect(() => emitHostRoute(undefined, 'rxdb-demo-vue', '/todo')).not.toThrow();
    });
  });

  describe('subscribeSubRoute', () => {
    it('宿主收到同名子应用的回传', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();

      subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      bus.$emit(ORBIT_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-vue', path: '/todo?x=1' });
      expect(onRoute).toHaveBeenCalledWith('/todo');
    });

    it('同屏多子应用时丢掉别人的回传', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();

      subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      bus.$emit(ORBIT_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-react', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('退订之后不再收到回传', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();

      const stop = subscribeSubRoute('rxdb-demo-vue', onRoute, bus);
      stop();
      bus.$emit(ORBIT_ROUTE_CHANGE_EVENT, { name: 'rxdb-demo-vue', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('没有 bus 时返回可安全调用的退订函数', () => {
      expect(() => subscribeSubRoute('rxdb-demo-vue', vi.fn(), undefined)()).not.toThrow();
    });
  });

  describe('subscribeHostRoute', () => {
    it('先应用 props.route，再听 bus 上的后续下发', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();
      const stop = subscribeHostRoute(onRoute, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));

      expect(onRoute).toHaveBeenCalledWith('/todo');

      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      expect(onRoute).toHaveBeenLastCalledWith('/search');

      stop();
      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/home' });
      expect(onRoute).toHaveBeenCalledTimes(2);
    });

    it('props 上没有 route 时不给初始值', () => {
      const onRoute = vi.fn();
      subscribeHostRoute(onRoute, createSubWindow(createFakeOrbitBus()));
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('丢掉发给别的子应用的下发', () => {
      const bus = createFakeOrbitBus();
      const onRoute = vi.fn();
      subscribeHostRoute(onRoute, createSubWindow(bus, 'rxdb-demo-vue'));

      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-react', path: '/todo' });
      expect(onRoute).not.toHaveBeenCalled();
    });

    it('独立运行（没有 $orbit）时返回可安全调用的退订函数', () => {
      const onRoute = vi.fn();
      expect(() => subscribeHostRoute(onRoute, {})()).not.toThrow();
      expect(onRoute).not.toHaveBeenCalled();
    });
  });

  describe('reportSubRoute', () => {
    it('子应用带自己的 __ORBIT.id 上报归一化路径', () => {
      const bus = createFakeOrbitBus();
      const onChange = vi.fn();
      bus.$on(ORBIT_ROUTE_CHANGE_EVENT, onChange);

      reportSubRoute('todo?x=1', createSubWindow(bus, 'rxdb-demo-angular'));
      expect(onChange).toHaveBeenCalledWith({ name: 'rxdb-demo-angular', path: '/todo' });
    });

    it('走独立事件名，不会触发宿主下发通道', () => {
      const bus = createFakeOrbitBus();
      const onHostRoute = vi.fn();
      bus.$on(ORBIT_ROUTE_EVENT, onHostRoute);

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

  describe('bindOrbitRoute', () => {
    it('先消化宿主初始路径，再注册上报 —— 首屏不会误报', () => {
      const bus = createFakeOrbitBus();
      const reported = vi.fn();
      bus.$on(ORBIT_ROUTE_CHANGE_EVENT, reported);
      const target = createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' });
      const io = createAdapter();

      let subscribedAtNavigate = true;
      io.navigate.mockImplementation(() => {
        subscribedAtNavigate = io.subscribed;
      });

      bindOrbitRoute(io.adapter, target);

      expect(io.navigate).toHaveBeenCalledWith('/todo', true);
      expect(subscribedAtNavigate).toBe(false);
      expect(reported).not.toHaveBeenCalled();
    });

    it('子应用自身导航回写宿主', () => {
      const bus = createFakeOrbitBus();
      const reported = vi.fn();
      bus.$on(ORBIT_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      bindOrbitRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      io.change('/search?q=1');

      expect(reported).toHaveBeenCalledWith({ name: 'rxdb-demo-vue', path: '/search' });
    });

    it('宿主后续下发走 push 语义', () => {
      const bus = createFakeOrbitBus();
      const io = createAdapter();

      bindOrbitRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));
      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });

      expect(io.navigate).toHaveBeenLastCalledWith('/search', false);
    });

    it('宿主下发引起的路由变化不再回传，避免绕成回环', () => {
      const bus = createFakeOrbitBus();
      const reported = vi.fn();
      bus.$on(ORBIT_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      bindOrbitRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      io.change('/search');

      expect(reported).not.toHaveBeenCalled();
    });

    it('路径没变时不重复下发导航', () => {
      const bus = createFakeOrbitBus();
      const io = createAdapter();

      bindOrbitRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue', { route: '/todo' }));
      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/todo' });

      expect(io.navigate).toHaveBeenCalledTimes(1);
    });

    it('独立运行时完全不接线', () => {
      const io = createAdapter();
      const stop = bindOrbitRoute(io.adapter, {});

      expect(io.subscribed).toBe(false);
      expect(io.navigate).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    });

    it('退订同时摘掉两个方向', () => {
      const bus = createFakeOrbitBus();
      const reported = vi.fn();
      bus.$on(ORBIT_ROUTE_CHANGE_EVENT, reported);
      const io = createAdapter();

      const stop = bindOrbitRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue'));
      stop();

      expect(io.unsubscribe).toHaveBeenCalled();
      bus.$emit(ORBIT_ROUTE_EVENT, { name: 'rxdb-demo-vue', path: '/search' });
      expect(io.navigate).not.toHaveBeenCalled();
    });
  });

  // 宿主（文档站）与子应用两端接在同一条 bus 上：宿主按 DemoMicroAppClient 的接线把回传过闸后写回地址栏
  describe('宿主闸门与子应用接线的组合时序', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const connect = (route: string) => {
      vi.useFakeTimers();
      const bus = createFakeWujieBus();
      const sync = new HostRouteSync({ ttlMs: 600 });
      const host = { path: route };
      subscribeSubRoute(
        'rxdb-demo-vue',
        path =>
          sync.receive(path, next => {
            host.path = next;
          }),
        bus
      );
      sync.expect(route);
      const io = createAdapter();
      bindWujieRoute(io.adapter, createSubWindow(bus, 'rxdb-demo-vue', { route }));
      return { host, io, sync };
    };

    it('深链进入后期望路径到位（不回传），等待期内的用户导航到期后补写回宿主', () => {
      const { host, io } = connect('/todo');
      io.change('/todo');
      vi.advanceTimersByTime(100);
      io.change('/search');

      expect(host.path).toBe('/todo');
      vi.advanceTimersByTime(600);
      expect(host.path).toBe('/search');
    });

    it('首屏回弹之后期望路径到位：回弹作废，不会在到期后补写', () => {
      const { host, io } = connect('/todo');
      io.change('/home');
      io.change('/todo');

      vi.advanceTimersByTime(1000);
      expect(host.path).toBe('/todo');
    });

    it('等待期里的连续导航只补写最后一条', () => {
      const { host, io } = connect('/todo');
      io.change('/todo');
      io.change('/search');
      io.change('/board');

      vi.advanceTimersByTime(700);
      expect(host.path).toBe('/board');
    });

    it('期望路径一直到不了（子应用停在默认页），到期后宿主跟上子应用', () => {
      const { host, io } = connect('/not-a-route');
      io.change('/home');

      vi.advanceTimersByTime(700);
      expect(host.path).toBe('/home');
    });

    it('宿主重新下发期望路径时作废之前挡下的回传', () => {
      const { host, io, sync } = connect('/todo');
      io.change('/todo');
      io.change('/search');
      sync.expect('/todo');

      vi.advanceTimersByTime(1400);
      expect(host.path).toBe('/todo');
    });

    it('cancel() 之后不再补写（宿主卸载）', () => {
      const { host, io, sync } = connect('/todo');
      io.change('/todo');
      io.change('/search');
      sync.cancel();

      vi.advanceTimersByTime(700);
      expect(host.path).toBe('/todo');
    });
  });
});
