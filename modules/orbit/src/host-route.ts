/**
 * 文档站宿主与演示子应用之间的路由协议。
 *
 * 与 {@link ./host-theme.ts | 主题协议} 同构：两个方向各占一个事件名，宿主侧下发期望路径，
 * 子应用侧回传自身路径。协议只传语义化路径，宿主负责保持文档站地址栏与子应用同步。
 */

import { getOrbitHost, type OrbitBus } from './host-theme.js';

/** Orbit bus 上的路由下发事件名：宿主 → 子应用。 */
export const ORBIT_ROUTE_EVENT = 'aiao:route';

/**
 * Orbit bus 上的路由回传事件名：子应用 → 宿主。
 *
 * 两个方向各占一个事件名，避免路径同步互相触发。
 */
export const ORBIT_ROUTE_CHANGE_EVENT = 'aiao:route-change';

/** 路由事件载荷。`name` 即宿主给子应用起的 Orbit 实例名，用于同屏多子应用时定向。 */
export interface OrbitRoutePayload {
  name: string;
  path: string;
}

/** {@link bindOrbitRoute} 需要的框架适配面，三端各自实现。 */
export interface OrbitRouteAdapter {
  /**
   * 导航到宿主期望的路径。
   *
   * @param replace - 首次（消化宿主初始路径）为 `true`，避免在子应用返回栈里留下一条它自己的默认路由
   */
  navigate(path: string, replace: boolean): void;
  /**
   * 订阅子应用自身的路由变化。
   *
   * @param onChange - 传入子应用当前路径，未归一化亦可
   * @returns 取消订阅
   */
  subscribe(onChange: (path: string) => void): () => void;
}

declare global {
  interface Window {
    __ORBIT?: { id?: string };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * 把任意载荷收成可比较的路由路径。
 *
 * 剥掉 query 与 hash、补前导斜杠、去掉尾部斜杠，让两侧的路径能直接用 `===` 比较。
 *
 * @param value - 字符串或其它未知值
 * @returns 无法识别时返回根路径 `/`
 */
export function normalizeRoutePath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const bare = value.split(/[?#]/)[0];
  if (!bare) return '/';
  const withSlash = bare.startsWith('/') ? bare : `/${bare}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

/**
 * 读取当前子应用的 Orbit 实例名。
 *
 * Orbit SDK 注入 `__ORBIT.id`，值为宿主创建实例时声明的 `instanceId`。
 * 子应用因此不必硬编码自己的名字，宿主改名也不用同步改子应用。
 *
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 独立运行时返回 `undefined`
 */
export function getOrbitAppId(target: unknown = globalThis): string | undefined {
  const scope = isRecord(target) ? target : undefined;
  const nested = isRecord(scope?.['window']) ? (scope['window'] as Record<string, unknown>) : undefined;
  const orbit = scope?.['__ORBIT'] ?? nested?.['__ORBIT'];
  if (!isRecord(orbit)) return undefined;
  return typeof orbit['id'] === 'string' ? orbit['id'] : undefined;
}

/**
 * 判断一条路由载荷是否发给 `name` 这个实例。
 *
 * 载荷缺 `name`（或本端识别不出自己的 id）时一律放行：只有一个子应用的场景不该因为
 * 拿不到 id 就整条通道失灵。
 */
const isForApp = (payload: unknown, name: string | undefined): boolean => {
  if (!isRecord(payload)) return false;
  const target = payload['name'];
  if (typeof target !== 'string' || !target || !name) return true;
  return target === name;
};

const readPath = (payload: unknown): string => normalizeRoutePath(isRecord(payload) ? payload['path'] : undefined);

/**
 * 宿主向指定子应用下发期望路径。
 *
 * @param bus - Orbit主应用 `bus`；缺省时静默跳过
 */
export function emitHostRoute(bus: OrbitBus | undefined, name: string, path: string): void {
  bus?.$emit?.(ORBIT_ROUTE_EVENT, { name, path: normalizeRoutePath(path) } satisfies OrbitRoutePayload);
}

/**
 * 宿主订阅子应用回传的当前路径。
 *
 * @param name - 宿主给该子应用起的 Orbit 实例名，用于过滤同屏其它子应用的回传
 * @param onRoute - 收到回传时的回调，参数已归一化
 * @param bus - Orbit主应用 `bus`；缺省时返回空退订函数
 * @returns 取消订阅
 */
export function subscribeSubRoute(
  name: string,
  onRoute: (path: string) => void,
  bus: OrbitBus | undefined
): () => void {
  if (!bus?.$on) return () => undefined;

  const handler = (payload: unknown) => {
    if (!isForApp(payload, name)) return;
    onRoute(readPath(payload));
  };
  bus.$on(ORBIT_ROUTE_CHANGE_EVENT, handler);
  return () => {
    bus.$off?.(ORBIT_ROUTE_CHANGE_EVENT, handler);
  };
}

/**
 * 子应用订阅宿主下发的路径。
 *
 * 先应用 `props.route` 再听 bus；初始路径通过属性传递，避免订阅建立前的事件丢失。
 *
 * @param onRoute - 收到路径时的回调，参数已归一化
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 取消订阅；独立运行（拿不到 `$orbit`）时返回空函数
 */
export function subscribeHostRoute(onRoute: (path: string) => void, target: unknown = globalThis): () => void {
  const host = getOrbitHost(target);
  if (!host) return () => undefined;

  if (host.props && Object.hasOwn(host.props, 'route')) onRoute(normalizeRoutePath(host.props['route']));

  const bus = host.bus;
  if (!bus?.$on) return () => undefined;

  const name = getOrbitAppId(target);
  const handler = (payload: unknown) => {
    if (!isForApp(payload, name)) return;
    onRoute(readPath(payload));
  };
  bus.$on(ORBIT_ROUTE_EVENT, handler);
  return () => {
    bus.$off?.(ORBIT_ROUTE_EVENT, handler);
  };
}

/**
 * 子应用上报自身当前路径。
 *
 * 独立运行（拿不到 `$orbit`）时静默跳过。
 *
 * @param target - 默认 `globalThis`；测试里可传入假 window
 */
export function reportSubRoute(path: string, target: unknown = globalThis): void {
  const host = getOrbitHost(target);
  if (!host) return;

  const payload: OrbitRoutePayload = { name: getOrbitAppId(target) ?? '', path: normalizeRoutePath(path) };
  host.bus?.$emit?.(ORBIT_ROUTE_CHANGE_EVENT, payload);
}

/** {@link HostRouteSync} 的构造参数。 */
export interface HostRouteSyncOptions {
  /** 期望路径的有效期，毫秒。默认 600。 */
  ttlMs?: number;
  /** 时间源，默认 `Date.now`。测试里可注入假时钟。 */
  now?: () => number;
}

/**
 * 宿主侧的回传闸门：压掉子应用首屏把宿主 URL 顶回默认路由的回弹。
 *
 * 子应用挂载后必然先落到自己的默认路由（React `/` → 重定向 `/home`，Angular 同理）。
 * 深链进 `/demos/vue/todo` 时，这条首屏回传会在挂载瞬间把宿主地址栏改回 `/demos/vue`。
 *
 * 用法：宿主每次下发期望路径时 {@link expect}，收到回传时交给 {@link receive}，由它决定立刻写回 URL、
 * 还是等期望路径到期后补写；宿主卸载时 {@link cancel}。
 *
 * TTL 是必需的兜底，不能只靠「命中即解锁」：宿主若下发了子应用不存在的路由，
 * 子应用会重定向到别处，期望路径永远命中不了，之后用户在子应用里的所有导航都写不回宿主 —— 锁死。
 *
 * 有状态，需按子应用实例持有。
 */
export class HostRouteSync {
  readonly #ttlMs: number;
  readonly #now: () => number;
  #pending: { path: string; until: number } | undefined;
  #deferred: ReturnType<typeof setTimeout> | undefined;

  constructor(options: HostRouteSyncOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 600;
    this.#now = options.now ?? (() => Date.now());
  }

  /** 记录宿主刚下发的期望路径，在它到位（或超时）之前挡住不匹配的回传；之前挡下待补写的回传作废。 */
  expect(path: string): void {
    this.cancel();
    this.#pending = { path: normalizeRoutePath(path), until: this.#now() + this.#ttlMs };
  }

  /**
   * 收下一条子应用回传：闸门放行就立刻交给 `apply`，被挡下的等期望路径到期后再补交。
   *
   * 被挡下的不一定是首屏回弹：宿主下发的路径到位时子应用并不回传（{@link bindWujieRoute} 只上报自身导航），
   * 闸门因此一直等到 TTL，期间用户已完成的导航同样被挡；只靠 {@link accept} 丢掉它，之后没有新回传，
   * 宿主地址栏就一直停在旧页。期望路径在等待期内到位、更新的回传到来、或宿主重新下发期望路径，待补写的都作废。
   *
   * @param path - 子应用回传的路径
   * @param apply - 写回宿主地址栏；放行时同步调用，补交时在到期后调用
   */
  receive(path: string, apply: (path: string) => void): void {
    this.cancel();
    const pending = this.#pending;
    if (!pending || this.accept(path)) {
      apply(normalizeRoutePath(path));
      return;
    }
    // 被挡下说明期望路径尚未到期：到期后的第一毫秒 accept 必然放行
    this.#deferred = setTimeout(
      () => {
        this.#deferred = undefined;
        if (this.accept(path)) apply(normalizeRoutePath(path));
      },
      pending.until - this.#now() + 1
    );
  }

  /** 作废待补写的回传（宿主卸载、或换了期望路径时）；闸门本身不变。 */
  cancel(): void {
    clearTimeout(this.#deferred);
    this.#deferred = undefined;
  }

  /**
   * 判断子应用回传的路径是否该写回宿主 URL。
   *
   * @returns 无待确认路径、已超时、或正好命中期望路径时为 `true`；命中与超时都会解除等待
   */
  accept(path: string): boolean {
    const pending = this.#pending;
    if (!pending) return true;
    if (this.#now() > pending.until) {
      this.#pending = undefined;
      return true;
    }
    if (normalizeRoutePath(path) !== pending.path) return false;
    this.#pending = undefined;
    return true;
  }
}

/**
 * 子应用侧的双向接线内核，三端共用。
 *
 * 时序上先消化宿主初始路径、再注册回传，因此首屏不会把子应用的默认路由误报给宿主。
 * 两个方向共享同一个「当前路径」，宿主下发引起的路由变化不会再被回传，天然不成环。
 *
 * @param adapter - 框架侧的导航与订阅实现，见 {@link OrbitRouteAdapter}
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 取消接线；独立运行（拿不到 `$orbit`）时不接线并返回空函数
 */
export function bindOrbitRoute(adapter: OrbitRouteAdapter, target: unknown = globalThis): () => void {
  if (!getOrbitHost(target)) return () => undefined;

  let current: string | undefined;

  const stopHost = subscribeHostRoute(path => {
    if (path === current) return;
    const replace = current === undefined;
    current = path;
    adapter.navigate(path, replace);
  }, target);

  const stopSub = adapter.subscribe(path => {
    const next = normalizeRoutePath(path);
    if (next === current) return;
    current = next;
    reportSubRoute(next, target);
  });

  return () => {
    stopHost();
    stopSub();
  };
}
