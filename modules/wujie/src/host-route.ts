/**
 * 文档站宿主与演示子应用之间的路由协议。
 *
 * 与 {@link ./host-theme.ts | 主题协议} 同构：两个方向各占一个事件名，宿主侧下发期望路径，
 * 子应用侧回传自身路径。刻意不用无界内置的 `sync` —— 它把子应用的**完整** URL（含 base）
 * 塞进宿主 query，宿主拿不到语义化路径，也没法反过来驱动子应用跳转。
 */

import { getWujieHost, type WujieBus } from './host-theme.js';

/** 无界 bus 上的路由下发事件名：宿主 → 子应用。 */
export const WUJIE_ROUTE_EVENT = 'aiao:route';

/**
 * 无界 bus 上的路由回传事件名：子应用 → 宿主。
 *
 * 与 {@link WUJIE_ROUTE_EVENT} 分开，理由同主题协议：无界的 `$emit` 会遍历所有 bus，
 * 两个方向共用一个事件名会让发送方收到自己的广播，绕成回环。
 */
export const WUJIE_ROUTE_CHANGE_EVENT = 'aiao:route-change';

/** 路由事件载荷。`name` 即宿主给子应用起的无界实例名，用于同屏多子应用时定向。 */
export interface WujieRoutePayload {
  name: string;
  path: string;
}

/** {@link bindWujieRoute} 需要的框架适配面，三端各自实现。 */
export interface WujieRouteAdapter {
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
    __WUJIE?: { id?: string };
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
 * 读取当前子应用的无界实例名。
 *
 * 无界会往子应用沙箱注入 `__WUJIE.id`，值就是宿主 `startApp` 时给的 `name`。
 * 子应用因此不必硬编码自己的名字，宿主改名也不用同步改子应用。
 *
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 独立运行时返回 `undefined`
 */
export function getWujieAppId(target: unknown = globalThis): string | undefined {
  const scope = isRecord(target) ? target : undefined;
  const nested = isRecord(scope?.['window']) ? (scope['window'] as Record<string, unknown>) : undefined;
  const wujie = scope?.['__WUJIE'] ?? nested?.['__WUJIE'];
  if (!isRecord(wujie)) return undefined;
  return typeof wujie['id'] === 'string' ? wujie['id'] : undefined;
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
 * @param bus - 无界主应用 `bus`；缺省时静默跳过
 */
export function emitHostRoute(bus: WujieBus | undefined, name: string, path: string): void {
  bus?.$emit?.(WUJIE_ROUTE_EVENT, { name, path: normalizeRoutePath(path) } satisfies WujieRoutePayload);
}

/**
 * 宿主订阅子应用回传的当前路径。
 *
 * @param name - 宿主给该子应用起的无界实例名，用于过滤同屏其它子应用的回传
 * @param onRoute - 收到回传时的回调，参数已归一化
 * @param bus - 无界主应用 `bus`；缺省时返回空退订函数
 * @returns 取消订阅
 */
export function subscribeSubRoute(
  name: string,
  onRoute: (path: string) => void,
  bus: WujieBus | undefined
): () => void {
  if (!bus?.$on) return () => undefined;

  const handler = (payload: unknown) => {
    if (!isForApp(payload, name)) return;
    onRoute(readPath(payload));
  };
  bus.$on(WUJIE_ROUTE_CHANGE_EVENT, handler);
  return () => {
    bus.$off?.(WUJIE_ROUTE_CHANGE_EVENT, handler);
  };
}

/**
 * 子应用订阅宿主下发的路径。
 *
 * 先应用 `props.route` 再听 bus —— 子应用起来之前 bus 上没有订阅者，宿主抢跑的 `$emit`
 * 只会换来无界的「事件订阅数量为空」告警，所以初始路径必须搭 `props` 进来。
 *
 * @param onRoute - 收到路径时的回调，参数已归一化
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 取消订阅；独立运行（拿不到 `$wujie`）时返回空函数
 */
export function subscribeHostRoute(onRoute: (path: string) => void, target: unknown = globalThis): () => void {
  const host = getWujieHost(target);
  if (!host) return () => undefined;

  if (host.props && Object.hasOwn(host.props, 'route')) onRoute(normalizeRoutePath(host.props['route']));

  const bus = host.bus;
  if (!bus?.$on) return () => undefined;

  const name = getWujieAppId(target);
  const handler = (payload: unknown) => {
    if (!isForApp(payload, name)) return;
    onRoute(readPath(payload));
  };
  bus.$on(WUJIE_ROUTE_EVENT, handler);
  return () => {
    bus.$off?.(WUJIE_ROUTE_EVENT, handler);
  };
}

/**
 * 子应用上报自身当前路径。
 *
 * 独立运行（拿不到 `$wujie`）时静默跳过。
 *
 * @param target - 默认 `globalThis`；测试里可传入假 window
 */
export function reportSubRoute(path: string, target: unknown = globalThis): void {
  const host = getWujieHost(target);
  if (!host) return;

  const payload: WujieRoutePayload = { name: getWujieAppId(target) ?? '', path: normalizeRoutePath(path) };
  host.bus?.$emit?.(WUJIE_ROUTE_CHANGE_EVENT, payload);
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
 * 用法：宿主每次下发期望路径时 {@link expect}，收到回传时用 {@link accept} 决定是否写回 URL。
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

  constructor(options: HostRouteSyncOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 600;
    this.#now = options.now ?? Date.now;
  }

  /** 记录宿主刚下发的期望路径，在它到位（或超时）之前挡住不匹配的回传。 */
  expect(path: string): void {
    this.#pending = { path: normalizeRoutePath(path), until: this.#now() + this.#ttlMs };
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
 * @param adapter - 框架侧的导航与订阅实现，见 {@link WujieRouteAdapter}
 * @param target - 默认 `globalThis`；测试里可传入假 window
 * @returns 取消接线；独立运行（拿不到 `$wujie`）时不接线并返回空函数
 */
export function bindWujieRoute(adapter: WujieRouteAdapter, target: unknown = globalThis): () => void {
  if (!getWujieHost(target)) return () => undefined;

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
