/**
 * @fileoverview 历史记录过滤与作用域键的纯函数集合
 *
 * 这些函数不持有任何状态，供 {@link HistoryManager} 与单元测试共用：
 * - {@link filterHistoriesByScope}：按作用域裁切历史
 * - {@link buildLastPushedMap}：合成每个仓库的「视同已推」水位线
 * - {@link filterUndoableHistories}：过滤可撤销的历史
 * - {@link getScopeKey}：生成作用域缓存键
 *
 * @module rxdb/version/history-filters
 */

import { getRxDBEntityIdentityKey } from '../system/change-codec.js';
import { generateHistoryDescription } from './history-item-builder.js';
import type { HistoryItem, HistoryScope } from './VersionManager.interface.js';

/**
 * 生成 repository 的缓存键（纯函数）
 *
 * @param repository - 带 namespace / entity 的仓储标识
 * @returns 'namespace:entity' 形式的缓存键
 *
 * @internal 供 HistoryManager 与同文件的过滤函数使用
 */
export const getRepositoryKey = (repository: { namespace: string; entity: string }): string =>
  `${repository.namespace}:${repository.entity}`;

/**
 * 合成「每个仓库推到哪了」的水位线映射：已提交的 `RxDBSync` 水位线与正在飞的认领取较大者。
 *
 * @param repoSyncs - 当前分支下的 `RxDBSync` 行
 * @param inFlight - `PushInFlightRegistry.snapshot()`，`namespace:entity` -> 正在飞的最大 change id
 * @returns `namespace:entity` -> 该仓库「视同已推」的最大 change id
 *
 * @remarks
 * `undoHistories$` 与 `fetchLatestHistories` 两条路径都要这份映射，此前各写一份循环。
 * 两份必须逐字一致：一边认在飞、另一边不认，反应式的「可撤销」列表就会和真正执行撤销时
 * 的判定分家 —— UI 上还亮着的那一项点下去什么也不会发生，或者更糟，真的撤销了一条
 * 已经在飞的变更。
 *
 * 取最大值而不是「有在飞就用在飞」：上一轮推到 30、这一轮只在飞到 20 时，
 * 水位线不许倒退。
 *
 * 在飞认领先进 map，因此**没有** `RxDBSync` 行的仓库也报得出来：`RxDBSync` 行由
 * `planRepositoryPush` 现建，行还没落到本次查询的结果集里时，认领仍然必须生效。
 */
export function buildLastPushedMap(
  repoSyncs: readonly { namespace: string; entity: string; lastPushedChangeId: number | null }[],
  inFlight: ReadonlyMap<string, number>
): Map<string, number> {
  const lastPushedMap = new Map(inFlight);

  for (const repoSync of repoSyncs) {
    if (repoSync.lastPushedChangeId === null) continue;
    const key = getRepositoryKey(repoSync);
    const claimed = lastPushedMap.get(key);
    if (claimed !== undefined && claimed >= repoSync.lastPushedChangeId) continue;
    lastPushedMap.set(key, repoSync.lastPushedChangeId);
  }

  return lastPushedMap;
}

/**
 * 按作用域过滤历史记录（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param scope - 作用域配置
 * @returns 过滤后的历史记录数组
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function filterHistoriesByScope(histories: HistoryItem[], scope: HistoryScope): HistoryItem[] {
  if (scope.type === 'database') {
    return histories;
  }

  return histories
    .map(history => {
      const filtered_changes = history.changes.filter(change => {
        if (scope.type === 'repository') {
          return change.namespace === scope.namespace && change.entity === scope.entity;
        }
        // 实体作用域
        return (
          change.namespace === scope.namespace && change.entity === scope.entity && change.entityId === scope.entityId
        );
      });

      if (filtered_changes.length === 0) return null;

      return {
        ...history,
        changes: filtered_changes,
        count: filtered_changes.length,
        description: generateHistoryDescription(filtered_changes)
      };
    })
    .filter((h): h is HistoryItem => h !== null);
}

/**
 * 过滤出可撤销的历史记录（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param lastPushedMap - namespace:entity -> lastPushedChangeId 的 repository 级水位线映射
 * @param undoBoundaryChangeId - 同步清空后的永久撤销边界
 * @param undoBoundaryCreatedAfter - 无数字 change id 时使用的严格时间边界
 * @returns 可撤销的历史记录数组
 *
 * @remarks
 * undoHistories$（UI 展示）与 undo()（实际执行）共用同一套规则，
 * 保证 UI 上看不到的历史不会被 undo() 撤销：
 * 1. history.reverted == false（按 updatedAt 水位合并持久态与本地态，未被撤销）
 * 2. remoteId == null（只有本地创建的变更才能撤销）
 * 3. id > 该 repository 的 lastPushedChangeId（未推送到远程；按 repository 独立判断）
 * 4. id > undoBoundaryChangeId（同步清空前的历史永久不可撤销）
 * 5. createdAt > undoBoundaryCreatedAfter（无数字 id 时保守隔离旧 session）
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function filterUndoableHistories(
  histories: HistoryItem[],
  lastPushedMap: Map<string, number>,
  undoBoundaryChangeId = 0,
  undoBoundaryCreatedAfter: Date | null = null
): HistoryItem[] {
  return histories.filter(history => {
    if (history.reverted) return false;

    return history.changes.every(change => {
      const isLocal = change.remoteId == null;
      const lastPushedId = lastPushedMap.get(getRepositoryKey(change));
      const notPushed = lastPushedId == null || change.id > lastPushedId;
      const afterUndoBoundary = change.id > undoBoundaryChangeId;
      const afterUndoTimeBoundary =
        undoBoundaryCreatedAfter === null || change.createdAt.getTime() > undoBoundaryCreatedAfter.getTime();
      return isLocal && notPushed && afterUndoBoundary && afterUndoTimeBoundary;
    });
  });
}

/**
 * 生成作用域缓存键（纯函数）
 *
 * @param scope - 作用域配置
 * @returns 缓存键字符串：'database' | 'namespace:entity' | 'namespace:entity:id'
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function getScopeKey(scope: HistoryScope): string {
  if (scope.type === 'database') {
    return 'database';
  }
  if (scope.type === 'repository') {
    return `${scope.namespace}:${scope.entity}`;
  }
  return `${scope.namespace}:${scope.entity}:${getRxDBEntityIdentityKey(scope.entityId)}`;
}
