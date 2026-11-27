import {
  findCurrentSyncRecord,
  getEntityMetadata,
  getSyncCapability,
  getSyncType,
  isRepositorySyncEnabled,
  PullOptions,
  PullRepositoryResult,
  PullResult,
  type RepositoryIdentifier,
  repositoryKey,
  RxDBDependencyFailedError,
  RxDBError,
  RxDBPartialSyncError,
  SyncBeginEvent,
  SyncCompleteEvent,
  SyncErrorEvent,
  type SyncFailure
} from '@aiao/rxdb';
import { BulkSyncOptions } from './bulk-sync.js';
import { buildDependencyGraph, type DependencyGraph } from './dependency-graph.js';
import { RxDBForeignKeyCycleError } from './foreign-key-cycle-error.js';
import { pullBatch } from './pull-batch.js';
import { cycleMemberPullDetail, unsupportedPullCycles } from './pull-cycle.js';
import { pullRepository } from './pull-repository.js';
import type { ScopedSyncAdapter } from './scoped-sync.js';
import { assertPullLimit } from './sync-manager.utils.js';
import type { SyncManager } from './SyncManager.js';

/**
 * Pull 功能实现
 *
 * 从远程拉取变更并应用到本地实体表
 *
 * 默认使用 pullBatch 单次 HTTP 请求拉取所有实体的变更。
 * 当指定 repositoryFilter 时，降级为 bulkSync 逐实体拉取。
 *
 * @param sm - SyncManager 实例
 * @param options - Pull 选项
 * @returns Pull 结果
 */
export async function pull(sm: SyncManager, options?: PullOptions): Promise<PullResult> {
  const rxdb = sm.rxdb;

  // 验证远程适配器配置
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }
  assertPullLimit(options?.limit, 'pull');

  // 触发同步开始事件
  rxdb.dispatchEvent(new SyncBeginEvent('pull'));

  try {
    let pullResult: PullResult;

    if (!options?.repositoryFilter?.length) {
      // 无过滤时使用批量拉取（单次 HTTP 请求）；远端登记为分区的仓库每次 pull 只问一次，批量跳过、随后逐个按区拉
      const bucketedRepositories = await findBucketedRepositories(sm);
      // 拉取补不齐的外键环与它们的下游这一次不拉，各记一条失败；其余仓库照常（US-038）
      const blocked = await blockedPullCycles(sm, bucketedRepositories);
      pullResult = await pullBatch(sm, {
        limit: options?.limit,
        fetchAll: options?.fetchAll,
        conflictResolver: options?.conflictResolver,
        bucketedRepositories,
        excludedRepositories: blocked.excluded
      });
      pullResult.failures.push(...blocked.failures);
      await pullBucketedRepositories(sm, options, pullResult, bucketedRepositories, blocked.excluded);
      // pullBatch 对 syncType === 'filter' 的仓库直接 continue（过滤条件是逐仓库的，
      // 拼不进一次批量请求）。不补这一趟，pull() 就会对 filter 仓库一条不拉却报告
      // `hasMore:false, failures:[]` —— isCompletePull 判真、pullableCount 归零，
      // 用户看到的是「已全部同步」。
      await pullFilterRepositories(sm, options, pullResult, blocked.excluded);
    } else {
      // 指定仓库过滤时降级为逐仓库拉取
      pullResult = await pullWithBulkSync(sm, options);
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
 * 拉取补不齐的外键环与它们的下游（US-038）
 *
 * @returns 这一次不拉的仓库键，与每个仓库一条失败：环上的仓库报 `pull-unsupported-member`，下游报依赖失败
 *
 * @remarks
 * 环上有按条件或按区同步、不能拉取或同步关着的成员时补不齐，原因见 {@link cycleMemberPullDetail}。
 * 环及其下游都未配置拉取时，直接跳过该环。
 */
async function blockedPullCycles(
  sm: SyncManager,
  bucketedRepositories: ReadonlySet<string>
): Promise<{ excluded: Set<string>; failures: SyncFailure[] }> {
  const entities = sm.rxdb.config.entities.map(EntityType => getEntityMetadata(EntityType));
  const graph = buildDependencyGraph(entities);
  const cycles = await unsupportedPullCycles(graph, repo =>
    cycleMemberPullDetail(sm.rxdb, repo, bucketedRepositories.has(repositoryKey(repo)))
  );
  const pullable = new Set(
    entities
      .filter(metadata => getSyncCapability(getSyncType(metadata, sm.rxdb.entitySync)).pull)
      .map(metadata => repositoryKey({ namespace: metadata.namespace, entity: metadata.name }))
  );

  const excluded = new Set<string>();
  const failures: SyncFailure[] = [];
  for (const { cycle, member, detail } of cycles) {
    const downstream = downstreamOf(graph, cycle.members);
    if (![...cycle.members, ...downstream].some(repo => pullable.has(repositoryKey(repo)))) continue;
    const cause = new RxDBForeignKeyCycleError(member, cycle, 'pull-unsupported-member', detail);
    for (const repo of cycle.members) {
      if (excluded.has(repositoryKey(repo))) continue;
      excluded.add(repositoryKey(repo));
      failures.push({
        repository: repo,
        error: new RxDBForeignKeyCycleError(repo, cycle, 'pull-unsupported-member', detail)
      });
    }
    for (const child of downstream) {
      if (excluded.has(repositoryKey(child))) continue;
      excluded.add(repositoryKey(child));
      failures.push({ repository: child, error: new RxDBDependencyFailedError(child, member, cause) });
    }
  }
  return { excluded, failures };
}

/** 依赖这些仓库（直接或间接）的仓库，不含它们自己 */
function downstreamOf(graph: DependencyGraph, seeds: readonly RepositoryIdentifier[]): RepositoryIdentifier[] {
  const seen = new Set(seeds.map(repositoryKey));
  const pending = [...seeds];
  const downstream: RepositoryIdentifier[] = [];
  for (let repo = pending.shift(); repo !== undefined; repo = pending.shift()) {
    for (const child of graph.get(repositoryKey(repo))?.requiredBy ?? []) {
      if (seen.has(repositoryKey(child))) continue;
      seen.add(repositoryKey(child));
      downstream.push(child);
      pending.push(child);
    }
  }
  return downstream;
}

/**
 * 远端登记为分区的仓库（`namespace:entity`），只看批量拉取会覆盖的仓库（能 pull、不是 filter）
 *
 * @remarks
 * 并发问一次：批量拉取的每一轮与随后的按区拉取都用这一份，不再逐轮、逐实体串行打同一个 RPC。
 * 远端适配器不支持按区同步时为空集。
 */
async function findBucketedRepositories(sm: SyncManager): Promise<ReadonlySet<string>> {
  const candidates = sm.rxdb.config.entities
    .map(EntityType => getEntityMetadata(EntityType))
    .filter(metadata => {
      const syncType = getSyncType(metadata, sm.rxdb.entitySync);
      return syncType !== 'filter' && getSyncCapability(syncType).pull;
    });
  if (candidates.length === 0) return new Set();

  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  const scopedAdapter = remoteAdapter as unknown as Partial<ScopedSyncAdapter>;
  const getEntitySyncInfo = scopedAdapter.getEntitySyncInfo;
  if (typeof getEntitySyncInfo !== 'function') return new Set();

  const infos = await Promise.all(
    candidates.map(metadata => getEntitySyncInfo.call(scopedAdapter, metadata.namespace, metadata.name))
  );
  return new Set(
    candidates.filter((_, index) => infos[index].bucketed).map(metadata => `${metadata.namespace}:${metadata.name}`)
  );
}

async function pullBucketedRepositories(
  sm: SyncManager,
  options: PullOptions | undefined,
  aggregated: PullResult,
  bucketedRepositories: ReadonlySet<string>,
  excluded: ReadonlySet<string>
) {
  const rxdb = sm.rxdb;

  for (const EntityType of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityType);
    const key = `${metadata.namespace}:${metadata.name}`;
    if (!bucketedRepositories.has(key) || excluded.has(key)) continue;

    const repoSync = await findCurrentSyncRecord(rxdb, metadata.namespace, metadata.name);
    if (!isRepositorySyncEnabled(repoSync)) continue;

    try {
      const result = await pullRepository(sm, metadata.namespace, metadata.name, {
        limit: options?.limit,
        fetchAll: options?.fetchAll,
        conflictResolver: options?.conflictResolver,
        includeRelated: false
      });
      accumulatePullProgress(aggregated, result);
      aggregated.failures.push(...result.failures);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (normalized instanceof RxDBPartialSyncError) {
        accumulatePullProgress(aggregated, normalized.result as PullRepositoryResult);
      }
      aggregated.failures.push({
        repository: { namespace: metadata.namespace, entity: metadata.name },
        error: normalized instanceof RxDBPartialSyncError ? normalized.cause : normalized
      });
    }
  }
}

/**
 * 补拉 `syncType === 'filter'` 的仓库，并把结果并进批量拉取的聚合里。
 *
 * @param sm - SyncManager 实例
 * @param options - 调用方传给 `pull()` 的选项，`limit` / `fetchAll` 原样透传
 * @param aggregated - `pullBatch` 的结果，**就地**累加
 *
 * @remarks
 * `includeRelated: false`：批量那一趟已经覆盖了所有非 filter 仓库，再级联一次只会重复拉取。
 * 单个仓库失败不中断其余仓库，失败结构化进 `failures` —— 与 `pullWithBulkSync` 同口径。
 */
async function pullFilterRepositories(
  sm: SyncManager,
  options: PullOptions | undefined,
  aggregated: PullResult,
  excluded: ReadonlySet<string>
) {
  const rxdb = sm.rxdb;

  for (const EntityClass of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityClass);
    const syncType = getSyncType(metadata, rxdb.entitySync);
    if (syncType !== 'filter' || !getSyncCapability(syncType).pull) continue;
    if (excluded.has(`${metadata.namespace}:${metadata.name}`)) continue;

    const repoSync = await findCurrentSyncRecord(sm.rxdb, metadata.namespace, metadata.name);
    if (!isRepositorySyncEnabled(repoSync)) continue;

    let result: PullRepositoryResult;
    try {
      result = await pullRepository(sm, metadata.namespace, metadata.name, {
        limit: options?.limit,
        fetchAll: options?.fetchAll,
        conflictResolver: options?.conflictResolver,
        includeRelated: false
      });
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      // 失败前已提交的进度挂在 RxDBPartialSyncError.result 上，同样要并进聚合
      if (normalized instanceof RxDBPartialSyncError) {
        accumulatePullProgress(aggregated, normalized.result as PullRepositoryResult);
      }
      aggregated.failures.push({
        repository: { namespace: metadata.namespace, entity: metadata.name },
        error: normalized instanceof RxDBPartialSyncError ? normalized.cause : normalized
      });
      continue;
    }

    accumulatePullProgress(aggregated, result);
    aggregated.failures.push(...result.failures);
  }
}

/** 把一个仓库的拉取进度就地累加进聚合结果（不含 failures）。 */
function accumulatePullProgress(aggregated: PullResult, result: PullRepositoryResult): void {
  aggregated.pulled += result.pulled;
  aggregated.compacted += result.compacted;
  aggregated.applied += result.applied;
  aggregated.conflictsResolved += result.conflictsResolved;
  aggregated.conflictsDeferred += result.conflictsDeferred;
  aggregated.hasMore ||= result.hasMore;
  aggregated.persistedProgress ||= result.persistedProgress;
  aggregated.historyInvalidated ||= result.historyInvalidated;
}

/**
 * 降级方案：使用 bulkSync 逐仓库拉取（用于指定 repositoryFilter 的场景）
 */
async function pullWithBulkSync(sm: SyncManager, options: PullOptions): Promise<PullResult> {
  const bulkOptions: BulkSyncOptions = {
    operation: 'pull',
    repositories: options.repositoryFilter?.map(item => {
      if (typeof item === 'string') {
        return { namespace: 'public', entity: item };
      }
      return item;
    }),
    // 此前这里漏传，逐仓库拉取时 limit/fetchAll 静默失效
    pull: { limit: options.limit, fetchAll: options.fetchAll, conflictResolver: options.conflictResolver }
  };

  const bulkResult = await sm.bulkSyncInSession(bulkOptions);

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
