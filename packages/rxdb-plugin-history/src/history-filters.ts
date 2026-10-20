/**
 * @fileoverview 历史记录过滤与作用域键的纯函数集合
 *
 * 这些函数不持有任何状态，供 {@link HistoryManager} 与单元测试共用：
 * - {@link filterHistoriesByScope}：按作用域裁切历史
 * - {@link buildLastPushedMap}：合成每个仓库的「视同已推」水位线
 * - {@link filterUndoableHistories} / {@link partitionUndoableHistories}：过滤可撤销的历史
 * - {@link splitRedoableHistories}：重做栈在作用域里能重做到哪
 * - {@link inheritedFloorOf} / {@link historyBarrierOf}：子分支分叉点拦住撤销 / 重做（US-315）
 * - {@link getScopeKey}：生成作用域缓存键
 *
 * @module rxdb/version/history-filters
 */

import {
  getRxDBEntityIdentityKey,
  type HistoryItem,
  type HistoryScope,
  type HistoryScopeAPI,
  type RxDBBranch
} from '@aiao/rxdb';
import type { ObservedValueOf } from 'rxjs';
import { generateHistoryDescription } from './history-item-builder.js';
import { historyTouchesScope } from './scope-selection.js';
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
 * 一条子分支在当前分支上的分叉点。
 *
 * @internal 供 HistoryManager 与 undo/redo sibling 共用
 */
export interface ChildFork {
  readonly branchId: string;
  /** 当前分支上的一条变更 id：子分支继承这一条及之前的全部变更 */
  readonly fromChangeId: number;
}

/** 撤销 / 重做栈停下的原因，即 `HistoryScopeAPI.undoBarrier$` 发出的非空值 */
export type HistoryBarrier = NonNullable<ObservedValueOf<HistoryScopeAPI['undoBarrier$']>>;

/**
 * 子分支行转成分叉点。
 *
 * @param children - `parentId` 指向本分支的分支行
 * @param branchId - 本分支 id；指回自己的那一行不算子分支
 * @returns 继承了本分支变更的子分支的分叉点，按分支 id 升序
 *
 * @remarks
 * `fromChangeId` 为空的子分支停在本分支自己的分叉点上（建它时本分支还没有变更），本分支的变更它一条也没继承，不算。
 * 孙分支不用看：它继承的本分支变更一定也被它的父分支（本分支的子分支）继承了，而有子分支的分支删不掉。
 *
 * @internal
 */
export const childForksOf = (
  children: readonly Pick<RxDBBranch, 'id' | 'fromChangeId'>[],
  branchId: string
): ChildFork[] =>
  children
    .flatMap(child =>
      child.id !== branchId && child.fromChangeId != null ?
        [{ branchId: child.id, fromChangeId: child.fromChangeId }]
      : []
    )
    .sort((a, b) =>
      a.branchId < b.branchId ? -1
      : a.branchId > b.branchId ? 1
      : 0
    );

/**
 * 两组分叉点是否相同（都按 {@link childForksOf} 的顺序排好）。
 *
 * @internal
 */
export const sameChildForks = (a: readonly ChildFork[], b: readonly ChildFork[]): boolean =>
  a.length === b.length &&
  a.every((fork, index) => fork.branchId === b[index].branchId && fork.fromChangeId === b[index].fromChangeId);

/**
 * 当前分支上已被子分支继承的最晚一条变更 id。
 *
 * @param forks - 当前分支的子分支分叉点
 * @returns 其中最大的分叉点；没有子分支继承任何变更时为 0（变更 id 从 1 起）
 *
 * @internal
 */
export const inheritedFloorOf = (forks: readonly ChildFork[]): number =>
  forks.reduce((floor, fork) => (fork.fromChangeId > floor ? fork.fromChangeId : floor), 0);

/**
 * 历史项是否已被子分支继承：有一条变更不晚于分叉点就算，事务不拆开看。
 *
 * @internal
 */
export const isInheritedHistory = (history: HistoryItem, floor: number): boolean =>
  history.changes.some(change => change.id <= floor);

/**
 * 被继承的历史项拦住撤销 / 重做时给出的原因。
 *
 * @param history - 拦住栈的那一项（已被继承）
 * @param forks - 当前分支的子分支分叉点
 * @returns 继承了这一项的子分支：分叉点不早于其中最早那条变更的，按 id 升序
 *
 * @internal
 */
export function historyBarrierOf(history: HistoryItem, forks: readonly ChildFork[]): HistoryBarrier {
  const earliest = history.changes.reduce(
    (min, change) => (change.id < min ? change.id : min),
    Number.POSITIVE_INFINITY
  );
  const branchIds = forks
    .filter(fork => fork.fromChangeId >= earliest)
    .map(fork => fork.branchId)
    .sort();
  return { reason: 'inherited_by_branch', branchIds };
}

/** {@link partitionUndoableHistories} 的结果，两组都保持入参顺序（最新在前） */
export interface UndoablePartition {
  /** 可撤销的历史项 */
  readonly undoable: HistoryItem[];
  /** 其余条件都满足、只因已被子分支继承而撤销不了的历史项 */
  readonly inherited: HistoryItem[];
}

/**
 * 把历史分成可撤销的与「只因被子分支继承而撤销不了」的两组（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param lastPushedMap - namespace:entity -> lastPushedChangeId 的 repository 级水位线映射
 * @param undoBoundaryChangeId - 同步清空后的永久撤销边界
 * @param undoBoundaryCreatedAfter - 无数字 change id 时使用的严格时间边界
 * @param inheritedFloor - 已被子分支继承的最晚一条变更 id，见 {@link inheritedFloorOf}
 * @returns 见 {@link UndoablePartition}；两组之外的是因别的原因撤销不了的
 *
 * @remarks
 * 规则见 {@link filterUndoableHistories}。被继承的历史项一定比可撤销的都早（分叉点之前 vs 之后），
 * 所以排除它们等于让撤销栈停在分叉点，不会跳着撤。
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function partitionUndoableHistories(
  histories: HistoryItem[],
  lastPushedMap: Map<string, number>,
  undoBoundaryChangeId = 0,
  undoBoundaryCreatedAfter: Date | null = null,
  inheritedFloor = 0
): UndoablePartition {
  const undoable: HistoryItem[] = [];
  const inherited: HistoryItem[] = [];
  for (const history of histories) {
    if (history.reverted) continue;
    const otherwiseUndoable = history.changes.every(change => {
      const isLocal = change.remoteId == null;
      const lastPushedId = lastPushedMap.get(getRepositoryKey(change));
      const notPushed = lastPushedId == null || change.id > lastPushedId;
      const afterUndoBoundary = change.id > undoBoundaryChangeId;
      const afterUndoTimeBoundary =
        undoBoundaryCreatedAfter === null || change.createdAt.getTime() > undoBoundaryCreatedAfter.getTime();
      return isLocal && notPushed && afterUndoBoundary && afterUndoTimeBoundary;
    });
    if (!otherwiseUndoable) continue;
    (isInheritedHistory(history, inheritedFloor) ? inherited : undoable).push(history);
  }
  return { undoable, inherited };
}

/**
 * 过滤出可撤销的历史记录（纯函数）
 *
 * @param histories - 原始历史记录数组
 * @param lastPushedMap - namespace:entity -> lastPushedChangeId 的 repository 级水位线映射
 * @param undoBoundaryChangeId - 同步清空后的永久撤销边界
 * @param undoBoundaryCreatedAfter - 无数字 change id 时使用的严格时间边界
 * @param inheritedFloor - 已被子分支继承的最晚一条变更 id，见 {@link inheritedFloorOf}
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
 * 6. id > inheritedFloor（不晚于子分支分叉点的变更已被继承：撤销它会让子分支记下的反向补丁过期，
 *    切回本分支时读到错值，US-315）
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function filterUndoableHistories(
  histories: HistoryItem[],
  lastPushedMap: Map<string, number>,
  undoBoundaryChangeId = 0,
  undoBoundaryCreatedAfter: Date | null = null,
  inheritedFloor = 0
): HistoryItem[] {
  return partitionUndoableHistories(
    histories,
    lastPushedMap,
    undoBoundaryChangeId,
    undoBoundaryCreatedAfter,
    inheritedFloor
  ).undoable;
}

/**
 * 历史项是否出现在该作用域的历史里：整库作用域什么都不筛，与 {@link filterHistoriesByScope} 同口径。
 *
 * @internal
 */
export const isHistoryShownInScope = (history: HistoryItem, scope: HistoryScope): boolean =>
  scope.type === 'database' || historyTouchesScope(history, scope);

/** {@link splitRedoableHistories} 的结果 */
export interface RedoableSplit {
  /** 作用域里能依次重做的历史项（未裁剪，栈顶在前） */
  readonly redoable: HistoryItem[];
  /** 拦住重做的那一项：作用域里第一项已被子分支继承的；没有则 `null` */
  readonly blockedBy: HistoryItem | null;
}

/**
 * 重做栈在作用域里能重做到哪（纯函数）
 *
 * @param histories - 重做栈（栈顶在前）
 * @param scope - 作用域
 * @param inheritedFloor - 已被子分支继承的最晚一条变更 id，见 {@link inheritedFloorOf}
 * @returns 见 {@link RedoableSplit}
 *
 * @remarks
 * 截在第一项被继承的之前，不跳过它去重做后面的：重做必须按撤销的逆序来，后面那项的补丁
 * 建在被拦住那项之上。作用域外的项不拦作用域内的重做，与作用域重做本来的口径一致。
 *
 * @internal 供 HistoryManager 和单元测试使用
 */
export function splitRedoableHistories(
  histories: HistoryItem[],
  scope: HistoryScope,
  inheritedFloor: number
): RedoableSplit {
  const touching = histories.filter(history => isHistoryShownInScope(history, scope));
  const blocked = touching.findIndex(history => isInheritedHistory(history, inheritedFloor));
  return blocked < 0 ?
      { redoable: touching, blockedBy: null }
    : { redoable: touching.slice(0, blocked), blockedBy: touching[blocked] };
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
