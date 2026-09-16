/**
 * @fileoverview 同步插件向历史插件借的那一小块面
 *
 * US-025 阶段 D 把推拉同步从 `@aiao/rxdb-plugin-history` 切到
 * `@aiao/rxdb-plugin-sync` 之后，两边仍有一条**单向**耦合：一次 pull / push 结束时，
 * undo 边界要作废、待拉计数要结算 —— 这些状态的主人是 {@link HistoryManager}，
 * 而触发时机只有同步侧知道。
 *
 * 因此不把 {@link HistoryManager} 整个交出去，只交这一张接口：
 *
 * - 方向是单向的。同步插件 `inject: ['plugin:history']`，历史插件对同步插件一无所知，
 *   `@aiao/rxdb-plugin-history` 的 `dependencies` 里也不会出现同步包 —— 否则两包互指。
 * - 面是窄的。八个成员，全部围绕「一次同步往返结束后历史该怎么变」，不透出 undo 栈、
 *   redo 栈、作用域 API 这些同步侧根本不该碰的东西。
 * - 结算口径留在历史侧。{@link SyncHistoryBridge.settlePull} 收 `PullOptions` /
 *   `PullResult` 原件，「这次算不算完整同步」由 `pullable-count.ts` 判定；
 *   同步侧不复制一份判据，两边也就不会漂。
 */

import type { PullOptions, PullResult } from '@aiao/rxdb';
import type { HistoryManager } from './HistoryManager.js';
import { isCompletePull } from './pullable-count.js';
import type { PushInFlightRegistry } from './push-inflight.js';

/**
 * 同步插件可见的历史侧能力。
 *
 * @remarks
 * 由 `VersionManager.syncBridge` 提供，`SyncManager` 在构造时接过去。
 *
 * @internal
 */
export interface SyncHistoryBridge {
  /**
   * 「哪些变更此刻正在飞往远端」的登记处。
   *
   * @remarks
   * push 与 undo 唯一的会合点，主人是 {@link VersionManager} —— undo 侧经
   * `rxdb.versionManager.pushInFlight` 读它，push 侧经本桥认领区间。
   * 两边读的必须是同一个实例，见 {@link PushInFlightRegistry}。
   */
  readonly pushInFlight: PushInFlightRegistry;

  /**
   * 在可重入同步上下文中执行：期间产生的本地写入不进 undo/redo 栈。
   *
   * @param fn - 同步动作
   */
  syncing<T>(fn: () => Promise<T>): Promise<T>;

  /** 与远端合并之后清空当前分支的 undo/redo —— 合并前的内容已经 undo 不回去了 */
  clearUndoHistory(): void;

  /**
   * pull 开始前签发结算令牌。
   *
   * @returns 令牌，交回 {@link settlePull} / {@link settleAbortedPull} /
   * {@link reconcilePullableCount}
   *
   * @remarks
   * 必须在真正发起 pull **之前**取：拉取期间到达的远端事件描述的是快照之后的新变更，
   * 结算时要能看出来，否则「完整同步」的归零会把它们一起吞掉。
   */
  beginPullableSettlement(): number;

  /**
   * 按一次成功 pull 的实际覆盖范围结算待拉计数。
   *
   * @param token - {@link beginPullableSettlement} 签发的令牌
   * @param options - 发起 pull 时的选项
   * @param result - pull 的结果
   */
  settlePull(token: number, options: PullOptions | undefined, result: PullResult): void;

  /**
   * 按一次抛错 pull 已落库的部分结算待拉计数。
   *
   * @param token - {@link beginPullableSettlement} 签发的令牌
   * @param pulled - 抛错前已经真实落库的条数，一条都没落时传 0
   *
   * @remarks
   * 令牌必须收回，否则代次永远停在旧值，后续结算全被判成「并发」。
   */
  settleAbortedPull(token: number, pulled: number): void;

  /**
   * 用远端水位线校准待拉计数。
   *
   * @param token - {@link beginPullableSettlement} 签发的令牌
   * @param count - 按各仓库持久化水位线算出的待拉总数
   */
  reconcilePullableCount(token: number, count: number): void;

  /**
   * 远端事件到达时累加待拉计数。
   *
   * @param count - 本次事件里属于当前激活分支的条数
   */
  incrementPullableCount(count: number): void;
}

/**
 * 造一座桥。
 *
 * @param historyManager - 取当前 {@link HistoryManager} 的闭包
 * @param pushInFlight - 飞行登记处
 *
 * @remarks
 * 第一个参数是闭包而不是实例：`VersionManager` 在 `init()` 里会重建
 * {@link HistoryManager}（上一纪元 destroy 过），桥若捏着旧实例，重连后所有结算
 * 都会打进一个已经拆掉事件总线的管理器。
 *
 * @internal
 */
export const createSyncHistoryBridge = (
  historyManager: () => HistoryManager,
  pushInFlight: PushInFlightRegistry
): SyncHistoryBridge => ({
  pushInFlight,
  syncing: fn => historyManager().syncing(fn),
  clearUndoHistory: () => historyManager().clearUndoHistory(),
  beginPullableSettlement: () => historyManager().beginPullableSettlement(),
  settlePull: (token, options, result) =>
    historyManager().settlePullableCount(token, {
      complete: isCompletePull(options, result),
      pulled: result.pulled
    }),
  settleAbortedPull: (token, pulled) => historyManager().settlePullableCount(token, { complete: false, pulled }),
  reconcilePullableCount: (token, count) => historyManager().reconcilePullableCount(token, count),
  incrementPullableCount: count => historyManager().incrementPullableCount(count)
});
