import {
  compactChanges,
  declareTrustedWrite,
  getRxDBChangeKey,
  isEntityMatchWhere,
  LWWConflictResolver,
  RxDBChange,
  RxDBError,
  RxDBSync,
  TrustedWriteIntent,
  type EntityType,
  type IRepository,
  type PullRepositoryOptions,
  type PullRepositoryResult,
  type RemoteChange,
  type RuleGroup,
  type RxDBAdapterLocalBase,
  type RxDBAdapterRemoteBase
} from '@aiao/rxdb';
import { getAncestorBranchIds } from './branch-utils.js';
import type { RxDBBucketCleanupBlockedError } from './bucket-cleanup-blocked-error.js';
import {
  entityIdentityKey,
  findBucketRows,
  localIdCandidates,
  planRowCleanup,
  removeBucketScope,
  scopedEntityKey,
  type BucketScope
} from './bucketed-scope-cleanup.js';
import {
  countActions,
  createConflictActionEntries,
  createEmptyActions,
  markLocalChangesSuperseded,
  queryPendingLocalChanges,
  resolveConflictsAndBuildActions
} from './pull-conflict-utils.js';
import { RemoteBackendMismatchError } from './remote-backend.js';
import { RxDBSyncBucketProgress, RxDBSyncBucketRow } from './scoped-sync.entity.js';
import { filterFingerprint, type ScopedEntitySyncInfo, type ScopedSyncAdapter } from './scoped-sync.js';
import { assertSyncOnMainCheckout } from './sync-manager.utils.js';
import type { SyncManager } from './SyncManager.js';

type BucketedRemoteAdapter = RxDBAdapterRemoteBase & ScopedSyncAdapter;

interface ScopedChange extends RemoteChange {
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  snapshotComplete?: boolean;
  bucket?: string | null;
}

/**
 * 一个分区这一轮拉到了哪：每提交一批就记进来
 *
 * @remarks
 * 拉取中途失败时，之前已提交的那些照样算数：撤销边界只认已提交的改写，丢掉它们就会让用户撤销到同步之前。
 */
interface BucketScopeTally {
  pulled: number;
  compacted: number;
  /** 提交了的本地业务行改写，含清理删掉的行 */
  applied: number;
  conflictsResolved: number;
  hasMore: boolean;
  /** 离开分区、却还被本地别的行引用而留下的行，每批一条 */
  blocked: RxDBBucketCleanupBlockedError[];
  /** 当前规则下这个分区的快照已经拉完并落库：它按旧规则同步的作用域可以退役 */
  snapshotComplete: boolean;
}

/** 一批落库之后交回的东西 */
interface ScopedBatchResult {
  progress: RxDBSyncBucketProgress;
  applied: number;
  conflictsResolved: number;
  blocked: RxDBBucketCleanupBlockedError | undefined;
}

const emptyTally = (): BucketScopeTally => ({
  pulled: 0,
  compacted: 0,
  applied: 0,
  conflictsResolved: 0,
  hasMore: false,
  blocked: [],
  snapshotComplete: false
});

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/** 清理不再拉取的作用域要用的上下文 */
interface RetiredScopeContext {
  readonly localAdapter: RxDBAdapterLocalBase;
  readonly entities: readonly EntityType[];
  readonly EntityType: EntityType;
  readonly repoSync: RxDBSync;
  readonly repository: { namespace: string; entity: string };
  readonly branchId: string;
}

type PullFailure = PullRepositoryResult['failures'][number];

export async function pullBucketedRepositoryIfSupported(
  sm: SyncManager,
  remoteAdapter: RxDBAdapterRemoteBase,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  namespace: string,
  entity: string,
  branchId: string,
  options: PullRepositoryOptions,
  filter: RuleGroup | undefined,
  syncInfo?: Pick<ScopedEntitySyncInfo, 'bucketed'>
): Promise<PullRepositoryResult | null> {
  if (!isBucketedRemoteAdapter(remoteAdapter)) return null;

  // `pull()` 一轮问一次全部仓库的登记信息，带着答案来的不再重问（US-236）
  const { bucketed } = syncInfo ?? (await remoteAdapter.getEntitySyncInfo(namespace, entity));
  if (!bucketed) return null;

  const branchIds = await getAncestorBranchIds(sm, branchId);
  return pullBucketedRepository(
    sm,
    remoteAdapter,
    localAdapter,
    EntityType,
    repoSync,
    namespace,
    entity,
    branchIds,
    options,
    filter
  );
}

function isBucketedRemoteAdapter(adapter: RxDBAdapterRemoteBase): adapter is BucketedRemoteAdapter {
  const candidate = adapter as unknown as Partial<ScopedSyncAdapter>;
  return (
    typeof candidate.getCallerBuckets === 'function' &&
    typeof candidate.getEntitySyncInfo === 'function' &&
    typeof candidate.getBucketSnapshotPoint === 'function' &&
    typeof candidate.getBucketChangeCount === 'function' &&
    typeof candidate.pullBucketSnapshot === 'function' &&
    typeof candidate.pullBucketChanges === 'function'
  );
}

async function pullBucketedRepository(
  sm: SyncManager,
  remoteAdapter: BucketedRemoteAdapter,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  namespace: string,
  entity: string,
  branchIds: readonly string[],
  options: PullRepositoryOptions,
  filter: RuleGroup | undefined
): Promise<PullRepositoryResult> {
  await sm.verifyRemoteBackend();
  const branchId = branchIds[0];
  const fingerprint = filterFingerprint(filter);
  const buckets = [...new Set(await remoteAdapter.getCallerBuckets())].sort();
  const progressRepository = localAdapter.getRepository(RxDBSyncBucketProgress);
  const existingProgress = await findRepositoryProgress(progressRepository, namespace, entity, branchId);

  const repository = { namespace, entity };
  const totals = emptyTally();
  const failures: PullFailure[] = [];
  const covered = new Set<string>();
  const conflictResolver = options.conflictResolver ?? new LWWConflictResolver();
  const retired: RetiredScopeContext = {
    localAdapter,
    entities: sm.rxdb.config.entities,
    EntityType,
    repoSync,
    repository,
    branchId
  };

  // 撤销的分区逐个清：一个作用域清不干净只记它的失败，不挡仍有授权的分区
  for (const progress of existingProgress.filter(progress => !buckets.includes(progress.bucket))) {
    totals.applied += await removeRetiredScope(retired, progress, failures);
  }

  // 一个分区失败不挡其他分区；失败之前已提交的那些照样计入
  for (const bucket of buckets) {
    const scope: BucketScope = { namespace, entity, branchId, bucket, filterFingerprint: fingerprint };
    const tally = emptyTally();
    const failure = await pullBucketScope(
      tally,
      sm,
      remoteAdapter,
      localAdapter,
      EntityType,
      repoSync,
      scope,
      branchIds,
      options,
      filter,
      conflictResolver
    ).then(() => undefined, toError);
    totals.pulled += tally.pulled;
    totals.compacted += tally.compacted;
    totals.applied += tally.applied;
    totals.conflictsResolved += tally.conflictsResolved;
    totals.hasMore ||= tally.hasMore || failure !== undefined;
    failures.push(...tally.blocked.map(error => ({ repository, error })));
    if (failure) failures.push({ repository, error: failure });
    if (tally.snapshotComplete) covered.add(bucket);
  }

  // 换了同步规则：一个分区按新规则的快照拉完并落库，才退役它按旧规则同步的作用域。只拉了一页、或拉到一半失败时
  // 新规则还没覆盖旧范围，这时退役会把仍然匹配、只是还没轮到的行从本机删掉
  for (const progress of existingProgress) {
    if (progress.bucket === '' || progress.filterFingerprint === fingerprint || !covered.has(progress.bucket)) continue;
    totals.applied += await removeRetiredScope(retired, progress, failures);
  }

  // 每次都记下拉取时间，进度总有落库
  const now = new Date();
  await localAdapter.transaction(async executor => {
    const repository = executor.getRepository(RxDBSync);
    await repository.update(repoSync, {
      lastPulledAt: now,
      updatedAt: now
    });
  });

  return {
    repository,
    pulled: totals.pulled,
    compacted: totals.compacted,
    applied: totals.applied,
    hasMore: totals.hasMore,
    conflictsResolved: totals.conflictsResolved,
    conflictsDeferred: 0,
    persistedProgress: true,
    historyInvalidated: totals.applied > 0,
    failures
  };
}

/**
 * 清掉一个不再拉取的作用域（分区被撤销，或换了同步规则）
 *
 * @returns 从本机删掉了几行
 *
 * @remarks
 * 还被本地别的行引用的行留下，连同作用域的进度行：下一次拉取再清。留下的原因与清理时的其他错误都只记进
 * `failures`，不往外抛——这一步排在拉取之前，抛出去会让同一实体仍有授权的分区这一轮全都拉不了。
 * 有行留下时，同一事务里删掉的其他行照样算数。
 */
async function removeRetiredScope(
  context: RetiredScopeContext,
  progress: RxDBSyncBucketProgress,
  failures: PullFailure[]
): Promise<number> {
  const { namespace, entity } = context.repository;
  const scope: BucketScope = {
    namespace,
    entity,
    branchId: context.branchId,
    bucket: progress.bucket,
    filterFingerprint: progress.filterFingerprint
  };
  try {
    const removal = await removeBucketScope(
      context.localAdapter,
      context.entities,
      context.EntityType,
      context.repoSync,
      scope,
      progress
    );
    if (removal.blocked) failures.push({ repository: context.repository, error: removal.blocked });
    return removal.removed;
  } catch (error) {
    failures.push({ repository: context.repository, error: toError(error) });
    return 0;
  }
}

/** 记下提交了的一批，交回落库之后的进度 */
function recordBatch(tally: BucketScopeTally, result: ScopedBatchResult): RxDBSyncBucketProgress {
  tally.applied += result.applied;
  tally.conflictsResolved += result.conflictsResolved;
  if (result.blocked) tally.blocked.push(result.blocked);
  tally.snapshotComplete = result.progress.snapshotComplete;
  return result.progress;
}

/**
 * 拉一个分区：先补快照、再拉增量，每提交一批就记进 `tally`
 *
 * @throws 拉取或落库的错误原样抛出；之前已提交的批次已经记在 `tally` 里
 */
async function pullBucketScope(
  tally: BucketScopeTally,
  sm: SyncManager,
  remoteAdapter: BucketedRemoteAdapter,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  branchIds: readonly string[],
  options: PullRepositoryOptions,
  filter: RuleGroup | undefined,
  conflictResolver: NonNullable<PullRepositoryOptions['conflictResolver']>
): Promise<void> {
  const progressRepository = localAdapter.getRepository(RxDBSyncBucketProgress);
  let progress = await findProgress(progressRepository, scope);
  const entities = sm.rxdb.config.entities;
  /** 作用域作废：按它同步来的行连同进度清掉，快照要从头拉；删掉的行照样计入 */
  const resetScope = async (current: RxDBSyncBucketProgress): Promise<RxDBBucketCleanupBlockedError | undefined> => {
    tally.snapshotComplete = false;
    const removal = await removeBucketScope(localAdapter, entities, EntityType, repoSync, scope, current);
    tally.applied += removal.removed;
    return removal.blocked;
  };

  if (progress && progress.remoteBackendId !== sm.remoteBackendId) {
    // 旧远端同步来的行还被引用着就不能从头拉：进度行留着，这个分区这一轮记为失败，下一轮再清
    const retained = await resetScope(progress);
    if (retained) throw retained;
    progress = undefined;
  }

  // 远端身份的核对与通用拉取同一口径：入口核对一次（pullBucketedRepository），之后每次远端往返之后、
  // 落库之前再核对一次。前后两次都是同一个远端，夹在中间的那次往返才算数；上一次往返之后的核对
  // 就是下一次往返之前的核对，落库只动本地，不必在它前后再问一遍
  if (!progress) {
    const snapshotPoint = await remoteAdapter.getBucketSnapshotPoint(
      scope.namespace,
      scope.entity,
      scope.bucket,
      branchIds
    );
    await sm.verifyRemoteBackend();
    progress = await localAdapter.transaction(async executor => {
      const repository = executor.getRepository(RxDBSyncBucketProgress);
      const current = await findProgress(repository, scope);
      if (current) return current;
      const created = Object.assign(sm.rxdb.entityManager.instantiate(RxDBSyncBucketProgress), {
        id: progressId(scope),
        namespace: scope.namespace,
        entity: scope.entity,
        branchId: scope.branchId,
        bucket: scope.bucket,
        filterFingerprint: scope.filterFingerprint,
        snapshotPoint,
        snapshotAfterId: null,
        cursor: 0,
        snapshotComplete: false,
        snapshotRunId: `${progressId(scope)}:${snapshotPoint}`,
        remoteBackendId: sm.remoteBackendId,
        lastPulledAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await repository.create(created);
      return created;
    });
  }
  tally.snapshotComplete = progress.snapshotComplete;

  while (!progress.snapshotComplete) {
    try {
      const rows = await remoteAdapter.pullBucketSnapshot(
        scope.namespace,
        scope.entity,
        scope.bucket,
        filter,
        progress.snapshotAfterId,
        options.limit ?? 1000
      );
      await sm.verifyRemoteBackend();
      tally.pulled += rows.length;
      const snapshotComplete = rows.length < (options.limit ?? 1000);
      const result = await applyScopedSnapshot(
        sm,
        localAdapter,
        EntityType,
        repoSync,
        scope,
        progress,
        rows,
        snapshotComplete,
        filter,
        conflictResolver
      );
      progress = recordBatch(tally, result);
      // 与增量同口径：没要 fetchAll 就只拉这一页、以 hasMore 告知。进度已随这一页落库，下一次从这页最后一个 id 接着拉
      if (!snapshotComplete && !options.fetchAll) {
        tally.hasMore = true;
        return;
      }
    } catch (error) {
      if (error instanceof RemoteBackendMismatchError) await resetScope(progress);
      throw error;
    }
  }

  let cursor = progress.cursor;
  try {
    do {
      const changes = await pullScopedAncestorChanges(
        remoteAdapter,
        cursor,
        options.limit ?? 1000,
        scope,
        branchIds,
        filter
      );
      tally.pulled += changes.length;
      tally.hasMore = changes.length >= (options.limit ?? 1000);
      if (changes.length === 0) break;

      await sm.verifyRemoteBackend();
      const result = await applyScopedChanges(
        sm,
        localAdapter,
        EntityType,
        repoSync,
        scope,
        progress,
        changes,
        filter,
        conflictResolver
      );
      tally.compacted += result.compacted;
      progress = recordBatch(tally, result);
      cursor = progress.cursor;
    } while (tally.hasMore && options.fetchAll);
  } catch (error) {
    if (error instanceof RemoteBackendMismatchError) await resetScope(progress);
    throw error;
  }
}

async function pullScopedAncestorChanges(
  remoteAdapter: BucketedRemoteAdapter,
  sinceId: number,
  limit: number,
  scope: BucketScope,
  branchIds: readonly string[],
  filter: RuleGroup | undefined
): Promise<RemoteChange[]> {
  const changes = await Promise.all(
    branchIds.map(branchId =>
      remoteAdapter.pullBucketChanges(sinceId, limit, scope.namespace, scope.entity, scope.bucket, filter, branchId)
    )
  );
  return changes
    .flat()
    .sort((left, right) => left.id - right.id)
    .slice(0, limit);
}

async function applyScopedSnapshot(
  sm: SyncManager,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress,
  rows: Record<string, unknown>[],
  snapshotComplete: boolean,
  filter: RuleGroup | undefined,
  conflictResolver: NonNullable<PullRepositoryOptions['conflictResolver']>
): Promise<ScopedBatchResult> {
  const changes = rows.map(row => snapshotRowToChange(scope, row, progress.snapshotPoint));
  const lastRow = changes.at(-1);
  return applyScopedBatch(
    sm,
    localAdapter,
    EntityType,
    repoSync,
    scope,
    progress,
    changes,
    filter,
    {
      snapshotComplete,
      snapshotAfterId: lastRow ? String(lastRow.entityId) : progress.snapshotAfterId,
      cleanupStaleSnapshotRows: snapshotComplete,
      isSnapshot: true
    },
    conflictResolver
  );
}

async function applyScopedChanges(
  sm: SyncManager,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress,
  changes: RemoteChange[],
  filter: RuleGroup | undefined,
  conflictResolver: NonNullable<PullRepositoryOptions['conflictResolver']>
): Promise<ScopedBatchResult & { compacted: number }> {
  return applyScopedBatch(
    sm,
    localAdapter,
    EntityType,
    repoSync,
    scope,
    progress,
    changes,
    filter,
    {
      snapshotComplete: true,
      snapshotAfterId: progress.snapshotAfterId,
      isSnapshot: false
    },
    conflictResolver
  );
}

async function applyScopedBatch(
  sm: SyncManager,
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress,
  changes: RemoteChange[],
  filter: RuleGroup | undefined,
  state: {
    snapshotComplete: boolean;
    snapshotAfterId: string | null;
    cleanupStaleSnapshotRows?: boolean;
    isSnapshot: boolean;
  },
  conflictResolver: NonNullable<PullRepositoryOptions['conflictResolver']>
) {
  const normalizedChanges = normalizeScopedChanges(changes, filter);
  return localAdapter.transaction(async executor => {
    // 拉取期间实例可能换挂到了可写检出位：本事务落在那套表上就一行都不写，游标也不动（US-314 B1.4）
    assertSyncOnMainCheckout(executor.tableSet, 'pullRepository');
    const changeRepository = executor.getRepository(RxDBChange);
    const progressRepository = executor.getRepository(RxDBSyncBucketProgress);
    const rowRepository = executor.getRepository(RxDBSyncBucketRow);

    const pending = await queryPendingLocalChanges(
      changeRepository,
      scope.namespace,
      scope.entity,
      scope.branchId,
      repoSync.lastPushedChangeId,
      normalizedChanges.flatMap(change => localIdCandidates(change.entityId))
    );
    const safeChanges = normalizedChanges.filter(
      change => change.type !== 'DELETE' || !pending.has(getRxDBChangeKey(change))
    );
    // 一个分区的 DELETE 只说明行离开了这个分区：只删映射，本地行删不删由下面的
    // planRowCleanup 按全部分区的映射、待推变更与本地引用决定。直接删会把刚换进另一个已授权分区的行一起删掉
    const upserts = safeChanges.filter(change => change.type !== 'DELETE');
    const actions = compactChanges(upserts, createEmptyActions());
    const actionEntries = createConflictActionEntries(upserts, actions);
    const resolved = await resolveConflictsAndBuildActions(actionEntries, pending, {
      changeRepo: changeRepository,
      conflictResolver:
        state.isSnapshot ? { resolve: async () => ({ type: 'KEEP_LOCAL' as const }) } : conflictResolver,
      dispatchEvent: event => sm.rxdb.dispatchEvent(event),
      repoLabel: `${scope.namespace}:${scope.entity}:${scope.bucket}`,
      deferLocalChangeSupersession: true,
      localClientId: sm.rxdb.context.clientId
    });

    // 离开这个作用域的行与它们在这里的映射（没有映射的为 undefined）：先定下删哪些、留哪些，再动映射
    const leaving = new Map<string, RxDBSyncBucketRow | undefined>();
    const snapshotRunId = progress.snapshotRunId;
    for (const [entityId, change] of latestChangesByEntityId(safeChanges)) {
      const rowId = rowIdentity(scope, entityId);
      const row = await findBucketRow(rowRepository, rowId);
      if (change.type === 'DELETE') {
        leaving.set(entityId, row);
        continue;
      }

      if (row) {
        if (state.isSnapshot) await rowRepository.update(row, { snapshotRunId });
      } else {
        const mapping = Object.assign(sm.rxdb.entityManager.instantiate(RxDBSyncBucketRow), {
          id: rowId,
          namespace: scope.namespace,
          entity: scope.entity,
          branchId: scope.branchId,
          bucket: scope.bucket,
          filterFingerprint: scope.filterFingerprint,
          entityId,
          snapshotRunId: state.isSnapshot ? snapshotRunId : null
        });
        await rowRepository.create(mapping);
      }
    }

    if (state.cleanupStaleSnapshotRows) {
      const stale = await findBucketRows(rowRepository, scope);
      for (const row of stale.filter(row => row.snapshotRunId !== snapshotRunId)) leaving.set(row.entityId, row);
    }

    // 还被本地别的行引用的行留在本机、映射也留着，等这个分区下一次整体清理；其余照常删
    const cleanup = await planRowCleanup(
      executor,
      sm.rxdb.config.entities,
      EntityType,
      scope,
      leaving.keys(),
      repoSync.lastPushedChangeId
    );
    for (const [entityId, row] of leaving) {
      if (row && !cleanup.retained.has(entityId)) await rowRepository.remove(row);
    }
    for (const entityId of cleanup.deletable) {
      const key = scopedEntityKey(scope, entityId);
      resolved.applyActions.inserts.delete(key);
      resolved.applyActions.updates.delete(key);
      resolved.applyActions.deletes.set(key, { patch: null, inversePatch: null });
    }

    let applied = 0;
    const actionCount = countActions(resolved.applyActions);
    if (actionCount > 0) {
      declareTrustedWrite(executor, {
        file: 'bucketed-pull.ts',
        symbol: 'applyScopedBatch',
        intent: TrustedWriteIntent.remote_sync
      });
      await executor.mergeChanges(resolved.applyActions, undefined, true);
      for (const supersession of resolved.localChangeSupersessions) {
        await markLocalChangesSuperseded(changeRepository, supersession.localChanges, supersession.remoteId);
      }
      applied = actionCount;
    }

    const lastChange = changes.at(-1);
    const nextCursor =
      state.isSnapshot ?
        state.snapshotComplete ?
          progress.snapshotPoint
        : progress.cursor
      : lastChange ? lastChange.id
      : progress.cursor;
    const nextProgress = await progressRepository.update(progress, {
      cursor: Math.max(progress.cursor, nextCursor),
      snapshotAfterId: state.snapshotAfterId,
      snapshotComplete: progress.snapshotComplete || state.snapshotComplete,
      lastPulledAt: new Date(),
      updatedAt: new Date()
    });
    return {
      progress: nextProgress,
      applied,
      compacted: Math.max(0, safeChanges.length - actionCount),
      conflictsResolved: resolved.conflictsResolved,
      blocked: cleanup.blocked
    };
  });
}

function normalizeScopedChanges(changes: RemoteChange[], filter: RuleGroup | undefined): RemoteChange[] {
  return changes.flatMap(change => {
    const scoped = change as ScopedChange;
    const before = scoped.beforeData ?? null;
    const after = scoped.afterData ?? null;
    if (change.type === 'DELETE' || after === null) return [change];
    if (!filter || isEntityMatchWhere(after, filter)) return [change];
    if (before && isEntityMatchWhere(before, filter)) {
      return [{ ...change, type: 'DELETE', patch: null, inversePatch: null }];
    }
    return [];
  });
}

function snapshotRowToChange(scope: BucketScope, row: Record<string, unknown>, id: number): RemoteChange {
  const entityId = row['id'];
  if (typeof entityId !== 'string' && typeof entityId !== 'number' && typeof entityId !== 'bigint') {
    throw new RxDBError(`Bucket snapshot row ${scope.namespace}:${scope.entity} has an invalid id.`);
  }
  const now = new Date();
  return {
    id,
    namespace: scope.namespace,
    entity: scope.entity,
    entityId,
    branchId: scope.branchId,
    type: 'INSERT',
    patch: row,
    inversePatch: null,
    createdAt: now,
    updatedAt: now,
    afterData: row
  } as RemoteChange;
}

function latestChangesByEntityId(changes: RemoteChange[]): Map<string, RemoteChange> {
  const result = new Map<string, RemoteChange>();
  for (const change of changes) result.set(entityIdentityKey(change.entityId), change);
  return result;
}

async function findProgress(
  repository: IRepository<typeof RxDBSyncBucketProgress>,
  scope: BucketScope
): Promise<RxDBSyncBucketProgress | undefined> {
  return (
    await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: progressId(scope) }] }
    })
  )[0];
}

async function findRepositoryProgress(
  repository: IRepository<typeof RxDBSyncBucketProgress>,
  namespace: string,
  entity: string,
  branchId: string
): Promise<RxDBSyncBucketProgress[]> {
  return repository.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'namespace', operator: '=', value: namespace },
        { field: 'entity', operator: '=', value: entity },
        { field: 'branchId', operator: '=', value: branchId }
      ]
    },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });
}

async function findBucketRow(
  repository: IRepository<typeof RxDBSyncBucketRow>,
  rowId: string
): Promise<RxDBSyncBucketRow | undefined> {
  return (
    await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: rowId }] }
    })
  )[0];
}

function progressId(scope: BucketScope): string {
  return JSON.stringify([
    'progress',
    scope.namespace,
    scope.entity,
    scope.branchId,
    scope.bucket,
    scope.filterFingerprint
  ]);
}

function rowIdentity(scope: BucketScope, entityId: string): string {
  return JSON.stringify([
    'row',
    scope.namespace,
    scope.entity,
    scope.branchId,
    scope.bucket,
    scope.filterFingerprint,
    entityId
  ]);
}
