import { SyncBeginEvent, SyncCompleteEvent, SyncErrorEvent } from '../rxdb-events.js';
import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { BulkSyncOptions } from './bulk-sync.js';
import { pullBatch } from './pull-batch.js';
import { PullOptions, PullResult } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';

/**
 * Pull 功能实现
 *
 * 从远程拉取变更并应用到本地实体表
 *
 * 默认使用 pullBatch 单次 HTTP 请求拉取所有实体的变更。
 * 当指定 repositoryFilter 时，降级为 bulkSync 逐实体拉取。
 *
 * @param vm - VersionManager 实例
 * @param options - Pull 选项
 * @returns Pull 结果
 */
export async function pull(vm: VersionManager, options?: PullOptions): Promise<PullResult> {
  const rxdb = vm.rxdb;

  // 验证远程适配器配置
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  // 触发同步开始事件
  rxdb.dispatchEvent(new SyncBeginEvent('pull'));

  try {
    let pullResult: PullResult;

    if (!options?.repositoryFilter?.length) {
      // 无过滤时使用批量拉取（单次 HTTP 请求）
      pullResult = await pullBatch(vm, {
        limit: options?.limit,
        fetchAll: options?.fetchAll
      });
    } else {
      // 指定仓库过滤时降级为逐仓库拉取
      pullResult = await pullWithBulkSync(vm, options);
    }

    // 触发同步完成事件
    rxdb.dispatchEvent(new SyncCompleteEvent('pull', pullResult));

    return pullResult;
  } catch (error) {
    // 触发同步错误事件
    rxdb.dispatchEvent(new SyncErrorEvent('pull', error as Error));
    throw error;
  }
}

/**
 * 降级方案：使用 bulkSync 逐仓库拉取（用于指定 repositoryFilter 的场景）
 */
async function pullWithBulkSync(vm: VersionManager, options: PullOptions): Promise<PullResult> {
  const bulkOptions: BulkSyncOptions = {
    operation: 'pull',
    repositories: options.repositoryFilter?.map(item => {
      if (typeof item === 'string') {
        return { namespace: 'public', entity: item };
      }
      return item;
    }),
    // 此前这里漏传，逐仓库拉取时 limit/fetchAll 静默失效
    pull: { limit: options.limit, fetchAll: options.fetchAll }
  };

  const bulkResult = await vm.bulkSync(bulkOptions);

  const aggregated: PullResult = {
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

  for (const result of bulkResult.results) {
    // 失败仓库自己已提交的进度也要累加 —— 它藏在 `RxDBPartialSyncError.result`
    // 里，被 bulkSync 原样挂在 `result.result` 上，只看 success 会把这段进度丢掉。
    const pullResult = result.result?.pullResult;
    if (pullResult) {
      aggregated.pulled += pullResult.pulled;
      aggregated.compacted += pullResult.compacted;
      aggregated.applied += pullResult.applied;
      aggregated.conflictsResolved += pullResult.conflictsResolved;
      aggregated.conflictsDeferred += pullResult.conflictsDeferred;
      aggregated.hasMore ||= pullResult.hasMore;
      aggregated.persistedProgress ||= pullResult.persistedProgress;
      aggregated.historyInvalidated ||= pullResult.historyInvalidated;
    }

    if (result.success) continue;

    // 此前失败的仓库被静默跳过，调用方拿到「成功」的聚合结果
    // 只留第一个失败会让后面几个仓库的失败无处可查，全部结构化保留
    const failure =
      result.error ??
      new RxDBError(`Repository pull failed: ${result.repository.namespace}:${result.repository.entity}`);
    aggregated.failures.push({
      repository: result.repository,
      // 嵌套的 partial error 解包成根因，避免调用方拿到「错误里套错误」
      error: failure instanceof RxDBPartialSyncError ? failure.cause : failure
    });
  }

  const [firstFailure] = aggregated.failures;
  if (firstFailure) {
    // 单个失败且零进度时包装只会多剥一层，原始错误更有用（对齐 pull-batch.ts 的约定）；
    // 但只要有进度、或有多于一个失败，就必须包装 —— 否则进度和其余失败都无处可查。
    if (!aggregated.persistedProgress && aggregated.failures.length === 1) throw firstFailure.error;
    throw new RxDBPartialSyncError<PullResult>(aggregated, firstFailure.error);
  }

  return aggregated;
}
