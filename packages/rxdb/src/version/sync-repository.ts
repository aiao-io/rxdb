import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { RepositorySyncBeginEvent, RepositorySyncCompleteEvent, RepositorySyncErrorEvent } from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { SyncProgress } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';
import {
  partialRepositoryProgressOf,
  pullRepository,
  type PullRepositoryOptions,
  type PullRepositoryResult
} from './pull-repository.js';
import {
  partialPushProgressOf,
  pushRepository,
  type PushRepositoryOptions,
  type PushRepositoryResult
} from './push-repository.js';
import { getSyncCapability, getSyncType } from './sync-type-utils.js';

/**
 * @fileoverview 仓库级别的同步操作
 *
 * 将仓库的拉取（pull）和推送（push）操作组合在一起，保证正确的执行顺序。
 */

/**
 * 仓库同步选项
 */
export interface SyncRepositoryOptions {
  /**
   * 同步方向
   * @default 'sync'
   */
  direction?: 'pull' | 'push' | 'sync';

  /**
   * 拉取（pull）选项
   */
  pull?: PullRepositoryOptions;

  /**
   * 推送（push）选项
   */
  push?: PushRepositoryOptions;
}

/**
 * 仓库同步结果
 */
export interface SyncRepositoryResult extends SyncProgress {
  /**
   * 拉取结果
   */
  pullResult: PullRepositoryResult;

  /**
   * 推送结果
   */
  pushResult: PushRepositoryResult;
}

/**
 * 跳过拉取时的占位结果（未发生任何拉取，进度两项都为 false）
 */
function emptyPullResult(namespace: string, entity: string): PullRepositoryResult {
  return {
    repository: { namespace, entity },
    pulled: 0,
    compacted: 0,
    applied: 0,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: false,
    historyInvalidated: false,
    failures: []
  };
}

/**
 * 跳过推送时的占位结果
 */
function emptyPushResult(namespace: string, entity: string): PushRepositoryResult {
  return {
    repository: { namespace, entity },
    pushed: 0,
    failed: 0,
    compacted: 0,
    originalCount: 0,
    failures: []
  };
}

/**
 * 把仓库级 pull 的中断错误重新包装成**仓库同步**粒度的中断错误。
 *
 * `pullRepository` 抛出的 `RxDBPartialSyncError.result` 是 `PullRepositoryResult`，
 * 而 `bulkSync` 会把它当成 `SyncRepositoryResult` 挂到 `result` 上给调用方读
 * `result.pullResult` —— 不在这里转一道，那个字段永远是 undefined，
 * 失败仓库的已提交进度照样丢。
 */
function rewrapPullFailure(error: unknown, namespace: string, entity: string): unknown {
  if (!(error instanceof RxDBPartialSyncError)) return error;
  const pullResult = partialRepositoryProgressOf(error);
  if (!pullResult) return error;
  const wrapped: SyncRepositoryResult = {
    pullResult,
    pushResult: emptyPushResult(namespace, entity),
    persistedProgress: pullResult.persistedProgress,
    historyInvalidated: pullResult.historyInvalidated
  };
  return new RxDBPartialSyncError<SyncRepositoryResult>(wrapped, error.cause);
}

/**
 * 把仓库级 push 的失败重新包装成**仓库同步**粒度的中断错误。
 *
 * 两段进度都不能因为 push 抛错而消失：
 *
 * - pull 阶段已落库的部分（`pullResult.persistedProgress`）；
 * - push 阶段已发到远端、**不会回滚**的部分（`RxDBPartialSyncError.result.pushed > 0`）。
 *   此前这里恒填 `emptyPushResult`，已经发出去的条目在聚合层看起来一条没推，
 *   调用方据此重试就是重复推送。
 *
 * 两段都没有时原样抛：包一层空进度只会让调用方多剥一层。
 *
 * @param error - `pushRepository` 抛出的任意异常
 * @param pullResult - 同一轮里 pull 阶段的结果，进度要一起交出去
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @returns 待抛出的异常
 */
function rewrapPushFailure(
  error: unknown,
  pullResult: PullRepositoryResult,
  namespace: string,
  entity: string
): unknown {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const pushProgress = partialPushProgressOf(normalized);
  const pushResult = pushProgress === undefined ? emptyPushResult(namespace, entity) : pushProgress;
  const persistedProgress = pullResult.persistedProgress || pushResult.pushed > 0;
  if (!persistedProgress) return normalized;

  const partial: SyncRepositoryResult = {
    pullResult,
    pushResult,
    persistedProgress,
    historyInvalidated: pullResult.historyInvalidated
  };
  // 已经是 partial error 时取根因，避免调用方拿到「错误里套错误」
  return new RxDBPartialSyncError<SyncRepositoryResult>(
    partial,
    normalized instanceof RxDBPartialSyncError ? normalized.cause : normalized
  );
}

/**
 * 同步一个仓库（先拉取再推送）
 *
 * @param vm - VersionManager 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @param options - 同步选项
 * @returns 同步结果
 *
 * @example
 * ```ts
 * // 同步 Todo 仓库（pull + push）
 * const result = await syncRepository(vm, 'public', 'Todo');
 *
 * // 使用自定义选项同步
 * const result = await syncRepository(vm, 'public', 'Todo', {
 *   pull: { limit: 500, fetchAll: true },
 *   push: { batchSize: 100 }
 * });
 * ```
 */
export async function syncRepository(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: SyncRepositoryOptions
): Promise<SyncRepositoryResult> {
  const rxdb = vm.rxdb;

  // 触发开始事件
  const includeRelated = options?.pull?.includeRelated ?? options?.push?.includeRelated ?? true;
  rxdb.dispatchEvent(new RepositorySyncBeginEvent('sync', namespace, entity, includeRelated));

  try {
    const result = await _syncRepositoryImpl(vm, namespace, entity, options);

    // 触发完成事件
    // 两个子结果在 SyncRepositoryResult 上都是必填：跳过的方向由 emptyPullResult /
    // emptyPushResult 交出各计数为 0 的占位。此前的 `?.x ?? 0` 是跑不到的分支，
    // 真出现 undefined 时它会把「结果缺失」伪装成「同步了 0 条」。
    const { pullResult, pushResult } = result;
    const stats = {
      pulled: pullResult.pulled,
      pushed: pushResult.pushed,
      compacted: pullResult.compacted + pushResult.compacted,
      failed: pushResult.failed,
      conflictsResolved: pullResult.conflictsResolved,
      conflictsDeferred: pullResult.conflictsDeferred
    };
    rxdb.dispatchEvent(new RepositorySyncCompleteEvent('sync', namespace, entity, stats));

    return result;
  } catch (error) {
    // 触发错误事件
    rxdb.dispatchEvent(new RepositorySyncErrorEvent('sync', namespace, entity, error as Error));
    throw error;
  }
}

/**
 * syncRepository 的内部实现
 */
async function _syncRepositoryImpl(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: SyncRepositoryOptions
): Promise<SyncRepositoryResult> {
  // 验证仓库是否存在
  const EntityType = vm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });

  if (!EntityType) {
    throw new RxDBError(`Entity not found: ${namespace}:${entity}`);
  }

  const metadata = getEntityMetadata(EntityType);

  // 检查同步类型（支持全局配置回退）
  const syncType = getSyncType(metadata, vm.rxdb.config.sync);
  if (syncType === 'none') {
    throw new RxDBError(
      `Cannot sync repository ${namespace}:${entity}: syncType is 'none'. ` +
        `This entity is not configured for remote synchronization.`
    );
  }

  // 先执行拉取（确保我们拥有最新数据）
  //
  // 方向能力从 `getSyncCapability` 取，不再内联枚举 —— 此前这里漏了
  // `querycache`（批量与单仓路径一直在拉它），同一个仓库走 sync 和走 pull 结果不一样。
  // `RxDBSync.enabled` 不在这层判定：pullRepository / pushRepository 各自会拒，
  // 在这里再判一次只会多读一遍系统表。
  let pullResult: PullRepositoryResult;
  const shouldPull =
    (options?.direction === 'pull' || options?.direction === 'sync' || !options?.direction) &&
    getSyncCapability(syncType).pull;

  if (shouldPull) {
    try {
      pullResult = await pullRepository(vm, namespace, entity, options?.pull);
    } catch (error) {
      throw rewrapPullFailure(error, namespace, entity);
    }
  } else {
    // 仅本地或仅推送：跳过拉取，创建占位结果
    pullResult = emptyPullResult(namespace, entity);
  }

  // 执行推送（发送本地变更）
  //
  // 'local' 不可推：它的定义是「SyncType.None + 只配了 local adapter、没有 remote」，
  // 公开契约把它写成「只在本地」。把它算成可推等于把私有本地数据送出去，
  // 而且这类仓库根本没有 remote adapter，推送本就无意义。fail-closed。
  let pushResult: PushRepositoryResult;
  const shouldPush =
    (options?.direction === 'push' || options?.direction === 'sync' || !options?.direction) &&
    getSyncCapability(syncType).push;

  if (shouldPush) {
    try {
      pushResult = await pushRepository(vm, namespace, entity, options?.push);
    } catch (error) {
      // pull 已落库的进度、push 已发到远端的进度，都不能因为这次抛错就消失
      throw rewrapPushFailure(error, pullResult, namespace, entity);
    }
  } else {
    // 仅远端或仅拉取：跳过推送，创建占位结果
    pushResult = emptyPushResult(namespace, entity);
  }

  return {
    pullResult,
    pushResult,
    persistedProgress: pullResult.persistedProgress || pushResult.pushed > 0,
    historyInvalidated: pullResult.historyInvalidated
  };
}
