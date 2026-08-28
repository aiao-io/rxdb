/**
 * @fileoverview 测试用的 {@link ReachabilityMonitor} 构造器
 *
 * @remarks
 * 直接 `new ReachabilityMonitor()` 会去探测宿主的 `navigator.onLine` 与全局
 * `addEventListener` —— 在 Vitest 的浏览器模式下这意味着用例的可达性判定挂在真实网卡上，
 * 而且注册的监听器活过用例本身。这里把两个来源都钉死：状态只由 `report()` 驱动。
 */

import { ReachabilityMonitor, type ReachabilityOptions } from '../../network/reachability.js';

/**
 * 造一个与宿主网络脱钩的可达性监视器
 *
 * @param options - 覆盖项；`navigatorOnLine` 与事件源已被钉死，通常只需要调退避参数
 * @returns 初始判定为在线、只认 `report()` 的监视器
 */
export const detachedReachability = (options: ReachabilityOptions = {}): ReachabilityMonitor =>
  new ReachabilityMonitor({
    navigatorOnLine: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    ...options
  });
