/**
 * 文档站宿主与演示子应用之间的主题协议。
 *
 * 优先走无界 `eventBus`；独立打开子应用时仍兼容旧的 `postMessage({ type: 'setTheme' })`。
 */

/** 无界 bus 上的主题事件名。 */
export const WUJIE_THEME_EVENT = 'aiao:theme';

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
  if (isRecord(value) && (value.theme === 'dark' || value.theme === 'light')) {
    return value.theme;
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
  if (isWujieHost(target.$wujie)) return target.$wujie;

  const nested = target.window;
  if (isRecord(nested) && isWujieHost(nested.$wujie)) return nested.$wujie;
  return undefined;
}

const hasOwnTheme = (host: WujieHost | undefined): boolean => !!host?.props && Object.hasOwn(host.props, 'theme');

/**
 * 订阅宿主主题。
 *
 * 在无界里先应用 `props.theme`，再听 {@link WUJIE_THEME_EVENT}；
 * 独立运行时退回 `message` 事件上的 `{ type: 'setTheme', theme }`。
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

  const handler = (event: Event) => {
    const data = (event as MessageEvent).data;
    if (!isRecord(data) || data.type !== 'setTheme') return;
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
