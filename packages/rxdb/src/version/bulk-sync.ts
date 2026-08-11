/**
 * @fileoverview 批量同步实现
 *
 * 提供在单次操作中同步多个仓库的功能，支持顺序或并发执行模式。
 */

import type { RxDB } from '../RxDB.js';
import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type { RepositoryIdentifier } from './dependency-graph.js';
import type { PullRepositoryOptions } from './pull-repository.js';
import type { PushRepositoryOptions } from './push-repository.js';
import { findCurrentSyncRecord } from './sync-record-utils.js';
import { syncRepository, type SyncRepositoryOptions, type SyncRepositoryResult } from './sync-repository.js';
import { getSyncCapability, getSyncType, isRepositorySyncEnabled } from './sync-type-utils.js';

/**
 * 批量同步选项
 */
export interface BulkSyncOptions {
  /**
   * 同步操作类型
   * @default 'sync'
   */
  operation?: 'pull' | 'push' | 'sync';

  /**
   * 目标仓库列表
   * 如果为空，则同步所有启用的仓库
   */
  repositories?: RepositoryIdentifier[];

  /**
   * 拉取选项（应用于所有仓库）
   */
  pull?: PullRepositoryOptions;

  /**
   * 推送选项（应用于所有仓库）
   */
  push?: PushRepositoryOptions;

  /**
   * 是否并发执行
   * @default false
   */
  concurrent?: boolean;

  /**
   * 并发限制（只有 concurrent=true 时生效）
   * @default 3
   */
  concurrency?: number;
}

/**
 * 批量同步结果
 */
export interface BulkSyncResult {
  /**
   * 成功的仓库数量
   */
  succeeded: number;

  /**
   * 失败的仓库数量
   */
  failed: number;

  /**
   * 每个仓库的详细结果
   */
  results: Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }>;

  /**
   * 总耗时（毫秒）
   */
  durationMs: number;
}

/**
 * 获取需要同步的仓库列表
 *
 * 如果 options.repositories 有值则使用该值；否则从 rxdb.config.entities 中挑出**真正能同步**的仓库。
 *
 * @param rxdb - RxDB 实例
 * @param options - 批量同步选项
 * @returns 需要同步的仓库列表
 *
 * @remarks
 * 这里是枚举路径，资格不足一律**跳过**（单仓入口才抛错）。两条过滤：
 * - 能力矩阵：两个方向都不可同步的（`none` / `local`）没有理由进队列。此前只跳
 *   `none`，`local` 会一路走到 `syncRepository` 才被 `shouldPull` / `shouldPush`
 *   双双判负，凭空多出一条「同步了 0 条」的结果。
 * - `RxDBSync.enabled`：被用户关掉的仓库跳过。留着它只会在 `pullRepository` /
 *   `pushRepository` 里抛错，把「我关的」变成一条同步失败。
 *
 * @internal
 */
export async function getRepositoriesToSync(rxdb: RxDB, options: BulkSyncOptions): Promise<RepositoryIdentifier[]> {
  // 如果明确指定了 repositories，则直接使用：调用方点名要同步谁，
  // 资格判定交给 syncRepository 去抛错，这里不替他做主
  if (options.repositories && options.repositories.length > 0) {
    return options.repositories;
  }

  const repositories: RepositoryIdentifier[] = [];

  for (const EntityClass of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityClass);

    // 检查 syncType（支持全局配置回退）
    const capability = getSyncCapability(getSyncType(metadata, rxdb.config.sync));
    if (!capability.pull && !capability.push) {
      continue;
    }

    const repoSync = await findCurrentSyncRecord(rxdb.versionManager, metadata.namespace, metadata.name);
    if (!isRepositorySyncEnabled(repoSync)) {
      continue;
    }

    repositories.push({
      namespace: metadata.namespace,
      entity: metadata.name
    });
  }

  return repositories;
}

/**
 * 同步单个仓库并处理错误
 *
 * @param rxdb - RxDB 实例
 * @param repo - 要同步的仓库
 * @param syncOptions - 同步选项
 * @returns 带有成功标志的结果对象
 */
async function syncSingleRepository(
  rxdb: RxDB,
  repo: RepositoryIdentifier,
  syncOptions: SyncRepositoryOptions
): Promise<{
  repository: RepositoryIdentifier;
  success: boolean;
  result?: SyncRepositoryResult;
  error?: Error;
}> {
  try {
    const result = await syncRepository(rxdb.versionManager, repo.namespace, repo.entity, syncOptions);

    return {
      repository: repo,
      success: true,
      result
    };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      repository: repo,
      success: false,
      // 失败前已提交的部分进度同时挂到 `result` 上：只留 `error` 的话，调用方要想知道
      // 「这个仓库其实已经落了多少数据」就得自己去拆 RxDBPartialSyncError
      result: normalized instanceof RxDBPartialSyncError ? (normalized.result as SyncRepositoryResult) : undefined,
      error: normalized
    };
  }
}

/**
 * 顺序执行批量同步
 *
 * @param rxdb - RxDB 实例
 * @param repositories - 仓库列表
 * @param syncOptions - 同步选项
 * @returns 结果数组
 */
async function executeSyncSequentially(
  rxdb: RxDB,
  repositories: RepositoryIdentifier[],
  syncOptions: SyncRepositoryOptions
): Promise<
  Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }>
> {
  const results: Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }> = [];

  for (const repo of repositories) {
    const result = await syncSingleRepository(rxdb, repo, syncOptions);
    results.push(result);
  }

  return results;
}

/**
 * 并发执行批量同步（带并发限制）
 *
 * @param rxdb - RxDB 实例
 * @param repositories - 仓库列表
 * @param syncOptions - 同步选项
 * @param concurrency - 最大并发操作数
 * @returns 结果数组
 */
async function executeSyncConcurrently(
  rxdb: RxDB,
  repositories: RepositoryIdentifier[],
  syncOptions: SyncRepositoryOptions,
  concurrency: number
): Promise<
  Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }>
> {
  const results: Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }> = [];

  // 按并发限制分批处理
  for (let i = 0; i < repositories.length; i += concurrency) {
    const batch = repositories.slice(i, i + concurrency);
    const batchPromises = batch.map(repo => syncSingleRepository(rxdb, repo, syncOptions));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * 对多个仓库执行批量同步
 *
 * 支持顺序和并发两种执行模式。
 * 在顺序模式下，仓库将被逐个同步。
 * 在并发模式下，可以同时并发同步多个仓库。
 *
 * @param rxdb - RxDB 实例
 * @param options - 批量同步选项
 * @returns 带有成功/失败计数的批量同步结果
 *
 * @example
 * ```typescript
 * // 顺序同步所有启用的仓库
 * const result = await bulkSync(rxdb);
 *
 * // 同步指定仓库
 * const result = await bulkSync(rxdb, {
 *   repositories: [
 *     { namespace: 'public', entity: 'Todo' },
 *     { namespace: 'public', entity: 'User' }
 *   ]
 * });
 *
 * // 并发同步并限制并发数
 * const result = await bulkSync(rxdb, {
 *   concurrent: true,
 *   concurrency: 3
 * });
 * ```
 */
export async function bulkSync(rxdb: RxDB, options: BulkSyncOptions = {}): Promise<BulkSyncResult> {
  const startTime = Date.now();

  // 1. 获取需要同步的仓库
  const repositories = await getRepositoriesToSync(rxdb, options);

  // 2. 构建同步选项
  const syncOptions: SyncRepositoryOptions = {
    direction: options.operation,
    pull: options.pull,
    push: options.push
  };

  // 3. 执行同步（顺序或并发）
  const concurrent = options.concurrent ?? false;
  const concurrency = options.concurrency ?? 3;
  // 非正或非整的并发度会让 `executeSyncConcurrently` 的 `i += concurrency` 永不前进，
  // 公开 Promise 永久 pending。挂死比报错难排查得多，入口就地 fail-fast
  if (concurrent && (!Number.isSafeInteger(concurrency) || concurrency < 1)) {
    throw new RxDBError(`bulkSync: concurrency 必须是不小于 1 的安全整数，收到 ${String(concurrency)}`);
  }

  let results: Array<{
    repository: RepositoryIdentifier;
    success: boolean;
    result?: SyncRepositoryResult;
    error?: Error;
  }>;

  if (concurrent) {
    results = await executeSyncConcurrently(rxdb, repositories, syncOptions, concurrency);
  } else {
    results = await executeSyncSequentially(rxdb, repositories, syncOptions);
  }

  // 4. 计算统计信息
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const durationMs = Date.now() - startTime;

  return {
    succeeded,
    failed,
    results,
    durationMs
  };
}
