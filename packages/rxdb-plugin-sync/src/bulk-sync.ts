/**
 * @fileoverview 批量同步实现
 *
 * 提供在单次操作中同步多个仓库的功能，支持顺序或并发执行模式。
 */

import {
  findCurrentSyncRecord,
  getEntityMetadata,
  getSyncCapability,
  getSyncType,
  isRepositorySyncEnabled,
  isSystemEntity,
  type PushRepositoryResult,
  repositoryKey,
  RepositorySyncBeginEvent,
  RepositorySyncCompleteEvent,
  RepositorySyncErrorEvent,
  resolvePushIneligibility,
  type RxDB,
  RxDBError,
  RxDBPartialSyncError,
  type SyncRejection
} from '@aiao/rxdb';
import type { RepositoryIdentifier } from './dependency-graph.js';
import type { PullRepositoryOptions } from './pull-repository.js';
import { pushRepositories, type PushRepositoryOptions, reportPushRejections } from './push-repository.js';
import {
  emptyPullResult,
  emptyPushResult,
  syncRepository,
  type SyncRepositoryOptions,
  type SyncRepositoryResult
} from './sync-repository.js';
import type { SyncManager } from './SyncManager.js';
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
   *
   * @remarks
   * 只作用于逐仓执行的 `'pull'` 与 `'sync'`。`'push'` 把全部仓库合成一次级联、按外键顺序推完，不分批并发。
   *
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
   *
   * @remarks
   * 点名（或枚举出）的仓库按顺序在前。`'push'` 在 `includeRelated`（默认）时连同它们所在的连通分量一起推，
   * 带进来的关联仓各占一条、排在后面；按同步类型或开关跳过的关联仓不列出。
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
 * 批量同步里一个仓库的结果
 *
 * @internal
 */
type BulkSyncItem = BulkSyncResult['results'][number];

/**
 * `'push'` 里一个仓库的结果：成功必带推送结果，失败必带错误
 *
 * @internal
 */
type BulkPushItem =
  | { repository: RepositoryIdentifier; success: true; result: SyncRepositoryResult; error?: undefined }
  | { repository: RepositoryIdentifier; success: false; result?: SyncRepositoryResult; error: Error };

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
 * 这里是枚举路径，资格不足一律**跳过**（单仓入口才抛错）。三条过滤：
 * - 系统表：它们不带自己的 `sync`，库级配置为 `full` 时会被 {@link getSyncType} 判成 `full`，
 *   推送就把四张本地簿记表当成目标，结果与失败清单里全是它们。系统表的同步由 `SyncManager` 直接安排。
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

  for (const EntityClass of rxdb.config.entities.filter(Entity => !isSystemEntity(Entity))) {
    const metadata = getEntityMetadata(EntityClass);

    // 检查 syncType（支持全局配置回退）
    const capability = getSyncCapability(getSyncType(metadata, rxdb.entitySync));
    if (!capability.pull && !capability.push) {
      continue;
    }

    const repoSync = await findCurrentSyncRecord(rxdb, metadata.namespace, metadata.name);
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
 * @param sm - 调用方持有的同步管理器实例
 * @param repo - 要同步的仓库
 * @param syncOptions - 同步选项
 * @param rejections - 本轮被拒清单收集器，由 {@link bulkSync} 统一上报
 * @returns 带有成功标志的结果对象
 */
async function syncSingleRepository(
  sm: SyncManager,
  repo: RepositoryIdentifier,
  syncOptions: SyncRepositoryOptions,
  rejections: SyncRejection[]
): Promise<BulkSyncItem> {
  try {
    const result = await syncRepository(sm, repo.namespace, repo.entity, syncOptions, rejections);

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
 * @param sm - 调用方持有的同步管理器实例
 * @param repositories - 仓库列表
 * @param syncOptions - 同步选项
 * @param rejections - 本轮被拒清单收集器
 * @returns 结果数组
 */
async function executeSyncSequentially(
  sm: SyncManager,
  repositories: RepositoryIdentifier[],
  syncOptions: SyncRepositoryOptions,
  rejections: SyncRejection[]
): Promise<BulkSyncItem[]> {
  const results: BulkSyncItem[] = [];

  for (const repo of repositories) {
    const result = await syncSingleRepository(sm, repo, syncOptions, rejections);
    results.push(result);
  }

  return results;
}

/**
 * 并发执行批量同步（带并发限制）
 *
 * @param sm - 调用方持有的同步管理器实例
 * @param repositories - 仓库列表
 * @param syncOptions - 同步选项
 * @param concurrency - 最大并发操作数
 * @param rejections - 本轮被拒清单收集器
 * @returns 结果数组
 */
async function executeSyncConcurrently(
  sm: SyncManager,
  repositories: RepositoryIdentifier[],
  syncOptions: SyncRepositoryOptions,
  concurrency: number,
  rejections: SyncRejection[]
): Promise<BulkSyncItem[]> {
  const results: BulkSyncItem[] = [];

  // 按并发限制分批处理
  for (let i = 0; i < repositories.length; i += concurrency) {
    const batch = repositories.slice(i, i + concurrency);
    const batchPromises = batch.map(repo => syncSingleRepository(sm, repo, syncOptions, rejections));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * `'push'`：全部仓库合成一次级联推完
 *
 * @param sm - 调用方持有的同步管理器实例
 * @param repositories - 点名（或枚举出）的仓库
 * @param pushOptions - 推送选项
 * @param rejections - 本轮被拒清单收集器
 * @returns 点名的仓库按顺序在前，带进来的关联仓在后
 *
 * @remarks
 * 逐仓各起一次级联时，跨仓顺序取决于 `config.entities` 的书写顺序（US-037）。这里先逐个过资格判定，
 * 口径与逐仓的 `syncRepository` → `pushRepository` 那条路一致，有资格的交给 {@link pushRepositories}
 * 一次推完。
 *
 * 事件只发给点名的仓库：开头各一次 begin，全部提交之后各一次 complete 或 error。带进来的关联仓不发，
 * 与单仓级联里的关联仓同一口径。同一个仓库点名两次只算一次，否则它的计数会被汇总两遍。
 */
async function executePush(
  sm: SyncManager,
  repositories: readonly RepositoryIdentifier[],
  pushOptions: PushRepositoryOptions | undefined,
  rejections: SyncRejection[]
): Promise<BulkSyncItem[]> {
  const requested = [...new Map(repositories.map(repo => [repositoryKey(repo), repo])).values()];
  const includeRelated = pushOptions?.includeRelated ?? true;
  for (const repo of requested) {
    sm.rxdb.dispatchEvent(new RepositorySyncBeginEvent('push', repo.namespace, repo.entity, includeRelated));
  }

  const ineligible = new Map<string, BulkPushItem>();
  const pushable: RepositoryIdentifier[] = [];
  for (const repo of requested) {
    const settled = await settlePushIneligible(sm, repo);
    if (settled) ineligible.set(repositoryKey(repo), settled);
    else pushable.push(repo);
  }
  const pushed = await pushTogether(sm, pushable, pushOptions, rejections);
  const pushedByKey = new Map(pushed.map(item => [repositoryKey(item.repository), item]));

  // 资格判定的结论优先：点名仓库被判不可推、又被别的点名仓库带进了级联时，级联只会把它记成跳过
  const requestedItems = requested.map(repo => {
    const key = repositoryKey(repo);
    const item = ineligible.get(key) ?? pushedByKey.get(key);
    if (!item) throw new RxDBError(`Internal error: push result missing for ${key}`);
    return item;
  });
  for (const item of requestedItems) dispatchPushSettled(sm, item);

  const requestedKeys = new Set(requested.map(repositoryKey));
  // 关联仓按同步类型或开关跳过时没推任何东西，也不是调用方点名的，不列出
  const relatedItems = pushed.filter(
    item => !requestedKeys.has(repositoryKey(item.repository)) && !(item.success && item.result.pushResult.skipped)
  );
  return [...requestedItems, ...relatedItems];
}

/**
 * 点名仓库进级联之前的资格判定
 *
 * @returns 不进级联时这个仓库的结果；有推送资格时返回 `undefined`
 *
 * @remarks
 * 与 `syncRepository`（方向 `'push'`）→ `pushRepository` 逐条同口径：实体不存在、`syncType` 为 `none`、
 * `RxDBSync.enabled` 关着都记失败；没有推送能力的（只读的 `remote`、只走 REST 的 `querycache`）记成推了 0 条的成功。
 */
async function settlePushIneligible(sm: SyncManager, repo: RepositoryIdentifier): Promise<BulkPushItem | undefined> {
  const key = repositoryKey(repo);
  const EntityType = sm.rxdb.config.entities.find(EntityClass => {
    const metadata = getEntityMetadata(EntityClass);
    return metadata.namespace === repo.namespace && metadata.name === repo.entity;
  });
  if (!EntityType) return failedItem(repo, new RxDBError(`Entity not found: ${key}`));

  const syncType = getSyncType(getEntityMetadata(EntityType), sm.rxdb.entitySync);
  if (syncType === 'none') {
    return failedItem(
      repo,
      new RxDBError(
        `Cannot sync repository ${key}: syncType is 'none'. ` +
          `This entity is not configured for remote synchronization.`
      )
    );
  }
  if (!getSyncCapability(syncType).push) {
    return pushItem(emptyPushResult(repo.namespace, repo.entity));
  }

  const ineligible = await resolvePushIneligibility(sm.rxdb, repo.namespace, repo.entity, syncType);
  return ineligible ? failedItem(repo, new RxDBError(`Cannot push repository ${key}: ${ineligible}.`)) : undefined;
}

/**
 * 把有资格的仓库一次推完，逐仓转成批量结果
 *
 * @remarks
 * 级联整体没能开始（`batchSize` 非法、依赖图成环）时，每个仓库都记这一条错——与逐仓推送时
 * 每个仓库各自撞上同一个错是同一个结果。
 */
async function pushTogether(
  sm: SyncManager,
  repositories: readonly RepositoryIdentifier[],
  pushOptions: PushRepositoryOptions | undefined,
  rejections: SyncRejection[]
): Promise<BulkPushItem[]> {
  try {
    return (await pushRepositories(sm, repositories, pushOptions, rejections)).map(pushItem);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return repositories.map(repo => failedItem(repo, normalized));
  }
}

/** 资格判定或级联开始之前就失败的仓库：没有任何进度 */
function failedItem(repository: RepositoryIdentifier, error: Error): BulkPushItem {
  return { repository, success: false, error };
}

/**
 * 一个仓库的推送结果 → 批量结果
 *
 * @remarks
 * 失败也带上 `result`：计数（含没推上去的 `failed`）照样进汇总。错误的形状与 `syncRepository`
 * 的推送失败一致：一条都没推上去时是原始错误，推上去了一部分时包成 {@link RxDBPartialSyncError}，
 * 进度挂在它的 `result` 上。
 */
function pushItem(pushResult: PushRepositoryResult): BulkPushItem {
  const { repository } = pushResult;
  const result: SyncRepositoryResult = {
    pullResult: emptyPullResult(repository.namespace, repository.entity),
    pushResult,
    persistedProgress: pushResult.pushed > 0,
    historyInvalidated: false
  };
  if (pushResult.success !== false) return { repository, success: true, result };

  const cause = pushResult.error;
  // `success: false` 必然带 error，见 push-repository 的 throwPushFailure
  if (!cause) throw new RxDBError(`Internal error: repository ${repositoryKey(repository)} failed without an error`);
  const error = pushResult.pushed > 0 ? new RxDBPartialSyncError<SyncRepositoryResult>(result, cause) : cause;
  return { repository, success: false, result, error };
}

/** 点名仓库的收尾事件：成功发 complete，失败发 error */
function dispatchPushSettled(sm: SyncManager, item: BulkPushItem): void {
  const { namespace, entity } = item.repository;
  if (!item.success) {
    sm.rxdb.dispatchEvent(new RepositorySyncErrorEvent('push', namespace, entity, item.error));
    return;
  }
  const { pushed, compacted, failed } = item.result.pushResult;
  sm.rxdb.dispatchEvent(new RepositorySyncCompleteEvent('push', namespace, entity, { pushed, compacted, failed }));
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

  // 槽位只在入口解析这一次。`rxdb.syncManager` 由插件作用域挂着，批处理跑到一半时
  // 最后一个适配器断开就会把它删掉；逐轮重解析会让剩余仓库全部解引用 `undefined`，
  // 被逐仓库的 try/catch 收成一串 TypeError，崩溃于是伪装成「同步失败」。
  const sm = rxdb.syncManager;

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

  // 本轮各仓已落库的被拒汇总后只报一次：`reportRejections` 整体替换，逐仓报会互相覆盖。
  // 逐仓的失败都被收成结果，不会越过这里，前仓已落库的被拒照报
  const rejections: SyncRejection[] = [];
  let results: BulkSyncItem[];
  if (options.operation === 'push') {
    results = await executePush(sm, repositories, options.push, rejections);
  } else if (concurrent) {
    results = await executeSyncConcurrently(sm, repositories, syncOptions, concurrency, rejections);
  } else {
    results = await executeSyncSequentially(sm, repositories, syncOptions, rejections);
  }
  reportPushRejections(sm, rejections);

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
