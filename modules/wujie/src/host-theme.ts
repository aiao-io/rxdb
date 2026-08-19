/**
 * 文档站宿主与演示子应用之间的主题协议。
 *
 * 优先走无界 `eventBus`；独立打开子应用时仍兼容旧的 `postMessage({ type: 'setTheme' })`，
 * 该兼容通道只接受同源消息。
 */

/** 无界 bus 上的主题事件名：宿主下发已解析主题。 */
export const WUJIE_THEME_EVENT = 'aiao:theme';

/**
 * 无界 bus 上的主题请求事件名：子应用请求宿主切换主题。
 *
 * 刻意与 {@link WUJIE_THEME_EVENT} 分开 —— 无界的 `$emit` 会遍历所有 bus，
 * 两个方向共用一个事件名会让宿主收到自己发出的广播，绕成回环。
 */
export const WUJIE_THEME_REQUEST_EVENT = 'aiao:theme-request';

/** 已经解析成可直接写到 `data-theme` 的主题。 */
export type ResolvedTheme = 'light' | 'dark';

/** 无界 EventBus 的最小订阅面，避免把 `wujie` 打进工具库依赖。 */
export interface WujieBus {
  $on?(event: string, fn: (...args: unknown[]) => void): unknown;
  $off?(event: string, fn: (...args: unknown[]) => void): unknown;
  $emit?(event: string, ...args: unknown[]): unknown;
}

/** 注入到子应用的 `$wujie` 对象。 */
export interface WujieHost {
  bus?: WujieBus;
  props?: {
    [key: string]: unknown;
    theme?: unknown;
  };
}

export interface HostThemeScope {
  $wujie?: WujieHost;
  window?: { $wujie?: WujieHost };
  location?: { origin?: string };
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

declare global {
  interface Window {
    $wujie?: WujieHost;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isWujieHost = (value: unknown): value is WujieHost => isRecord(value);

/**
 * 把宿主传来的任意载荷收成 `light` / `dark`。
 *
 * @param value - 字符串、`{ theme }` 或其它未知值
 * @returns 无法识别时回退到 `light`，避免子应用闪白以外的第三种状态
 */
export function parseResolvedTheme(value: unknown): ResolvedTheme {
  if (value === 'dark' || value === 'light') return value;
  if (isRecord(value)) {
    const theme = value['theme'];
    if (theme === 'dark' || theme === 'light') return theme;
  }
  return 'light';
}

/**
 * 从当前执行上下文取出无界注入的 `$wujie`。
 *
 * @param target - 默认 `globalThis`；测试里可传入假 window
 */
export function getWujieHost(target: unknown = globalThis): WujieHost | undefined {
  if (!isRecord(target)) return undefined;
  const direct = target['$wujie'];
  if (isWujieHost(direct)) return direct;

  const nested = target['window'];
  if (isRecord(nested)) {
    const nestedHost = nested['$wujie'];
    if (isWujieHost(nestedHost)) return nestedHost;
  }
  return undefined;
}

const hasOwnTheme = (host: WujieHost | undefined): boolean => !!host?.props && Object.hasOwn(host.props, 'theme');

/**
 * 取当前执行上下文自身的 origin，用来校验 `message` 事件来源。
 *
 * @returns 拿不到非空 origin 时返回 `undefined`
 */
function getScopeOrigin(target: unknown): string | undefined {
  if (!isRecord(target)) return undefined;
  const location = target['location'];
  if (!isRecord(location)) return undefined;
  const origin = location['origin'];
  return typeof origin === 'string' && origin.length > 0 ? origin : undefined;
}

/**
 * 订阅宿主主题。
 *
 * 在无界里先应用 `props.theme`，再听 {@link WUJIE_THEME_EVENT}；
 * 独立运行时退回 `message` 事件上的 `{ type: 'setTheme', theme }`。
 *
 * `message` 通道只接受与自身 origin 严格相同的消息；跨域窗口、空 origin 的
 * sandboxed iframe，以及取不到 `location.origin` 的上下文一律不接线。
 *
 * @returns 取消订阅
 */
export function subscribeHostTheme(
  onTheme: (theme: ResolvedTheme) => void,
  target: unknown = typeof globalThis === 'object' ? globalThis : undefined
): () => void {
  const host = getWujieHost(target);
  if (host) {
    if (hasOwnTheme(host)) onTheme(parseResolvedTheme(host.props?.theme));

    const bus = host.bus;
    if (bus?.$on) {
      const handler = (payload: unknown) => onTheme(parseResolvedTheme(payload));
      bus.$on(WUJIE_THEME_EVENT, handler);
      return () => {
        bus.$off?.(WUJIE_THEME_EVENT, handler);
      };
    }
    return () => undefined;
  }

  const eventTarget = target as HostThemeScope | undefined;
  if (!eventTarget?.addEventListener || !eventTarget.removeEventListener) return () => undefined;

  // 任何窗口都能往这里 postMessage，`message` 通道只认同源来源。
  // 拿不到自身 origin 就无从校验，宁可不订阅，也不留一个「空 origin 放行」的口子 ——
  // sandboxed iframe / `data:` / `blob:` 文档的 origin 正是空串。
  const scopeOrigin = getScopeOrigin(target);
  if (!scopeOrigin) return () => undefined;

  const handler = (event: Event) => {
    const message = event as MessageEvent;
    if (message.origin !== scopeOrigin) return;
    const data = message.data;
    if (!isRecord(data) || data['type'] !== 'setTheme') return;
    onTheme(parseResolvedTheme(data));
  };
  eventTarget.addEventListener('message', handler);
  return () => eventTarget.removeEventListener?.('message', handler);
}

/**
 * 主应用向所有子应用广播已解析主题。
 *
 * @param bus - 无界主应用 `bus`；缺省时静默跳过
 */
export function emitHostTheme(bus: WujieBus | undefined, theme: ResolvedTheme): void {
  bus?.$emit?.(WUJIE_THEME_EVENT, { theme });
}

/**
 * 子应用请求宿主切换主题。
 *
 * 只该在**用户主动切换**时调用；{@link subscribeHostTheme} 回调里收到宿主下发的主题后
 * 不要回推，否则两端互相触发。独立运行（拿不到 `$wujie`）时静默跳过。
 *
 * @param theme - 已解析主题；子应用的 `auto` 要先落到 `light` / `dark`
 * @param target - 默认 `globalThis`；测试里可传入假 window
 */
export function requestHostTheme(theme: ResolvedTheme, target: unknown = globalThis): void {
  getWujieHost(target)?.bus?.$emit?.(WUJIE_THEME_REQUEST_EVENT, { theme });
}

/**
 * 宿主订阅子应用发来的主题切换请求。
 *
 * @param onTheme - 收到请求时的回调，参数已收敛成 `light` / `dark`
 * @param bus - 无界主应用 `bus`；缺省时返回空退订函数
 * @returns 取消订阅
 */
export function subscribeThemeRequest(onTheme: (theme: ResolvedTheme) => void, bus: WujieBus | undefined): () => void {
  if (!bus?.$on) return () => undefined;

  const handler = (payload: unknown) => onTheme(parseResolvedTheme(payload));
  bus.$on(WUJIE_THEME_REQUEST_EVENT, handler);
  return () => {
    bus.$off?.(WUJIE_THEME_REQUEST_EVENT, handler);
  };
}
