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
import {
  entityIdentityKey,
  findBucketRows,
  findRowsWithoutMappings,
  localIdCandidates,
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
import { filterFingerprint, type ScopedSyncAdapter } from './scoped-sync.js';
import { assertSyncOnMainCheckout } from './sync-manager.utils.js';
import type { SyncManager } from './SyncManager.js';

type BucketedRemoteAdapter = RxDBAdapterRemoteBase & ScopedSyncAdapter;

interface ScopedChange extends RemoteChange {
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  snapshotComplete?: boolean;
  bucket?: string | null;
}

interface BucketPullResult {
  pulled: number;
  compacted: number;
  applied: number;
  conflictsResolved: number;
  historyInvalidated: boolean;
  hasMore: boolean;
}

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
  filter: RuleGroup | undefined
): Promise<PullRepositoryResult | null> {
  if (!isBucketedRemoteAdapter(remoteAdapter)) return null;

  const syncInfo = await remoteAdapter.getEntitySyncInfo(namespace, entity);
  if (!syncInfo.bucketed) return null;

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

  let pulled = 0;
  let compacted = 0;
  let applied = 0;
  let conflictsResolved = 0;
  let historyInvalidated = false;
  let hasMore = false;
  const failures: { repository: { namespace: string; entity: string }; error: Error }[] = [];
  const completedBuckets = new Set<string>();
  const conflictResolver = options.conflictResolver ?? new LWWConflictResolver();

  for (const progress of existingProgress) {
    if (!buckets.includes(progress.bucket)) {
      await removeBucketScope(
        localAdapter,
        EntityType,
        repoSync,
        { namespace, entity, branchId, bucket: progress.bucket, filterFingerprint: progress.filterFingerprint },
        progress
      );
    }
  }

  for (const bucket of buckets) {
    const scope: BucketScope = { namespace, entity, branchId, bucket, filterFingerprint: fingerprint };
    try {
      const result = await pullBucketScope(
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
      );
      pulled += result.pulled;
      compacted += result.compacted;
      applied += result.applied;
      conflictsResolved += result.conflictsResolved;
      historyInvalidated ||= result.historyInvalidated;
      hasMore ||= result.hasMore;
      completedBuckets.add(bucket);
    } catch (error) {
      hasMore = true;
      failures.push({
        repository: { namespace, entity },
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  if (completedBuckets.size === buckets.length) {
    for (const progress of existingProgress) {
      if (progress.bucket === '' || progress.filterFingerprint === fingerprint) continue;
      if (!buckets.includes(progress.bucket)) continue;
      await removeBucketScope(
        localAdapter,
        EntityType,
        repoSync,
        { namespace, entity, branchId, bucket: progress.bucket, filterFingerprint: progress.filterFingerprint },
        progress
      );
    }
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
    repository: { namespace, entity },
    pulled,
    compacted,
    applied,
    hasMore,
    conflictsResolved,
    conflictsDeferred: 0,
    persistedProgress: true,
    historyInvalidated,
    failures
  };
}

async function pullBucketScope(
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
): Promise<BucketPullResult> {
  const progressRepository = localAdapter.getRepository(RxDBSyncBucketProgress);
  let progress = await findProgress(progressRepository, scope);
  let pulled = 0;
  let compacted = 0;
  let applied = 0;
  let conflictsResolved = 0;
  let historyInvalidated = false;
  let hasMore: boolean;

  if (progress && progress.remoteBackendId !== sm.remoteBackendId) {
    await removeBucketScope(localAdapter, EntityType, repoSync, scope, progress);
    progress = undefined;
  }

  if (!progress) {
    await sm.verifyRemoteBackend();
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

  while (!progress.snapshotComplete) {
    try {
      await sm.verifyRemoteBackend();
      const rows = await remoteAdapter.pullBucketSnapshot(
        scope.namespace,
        scope.entity,
        scope.bucket,
        filter,
        progress.snapshotAfterId,
        options.limit ?? 1000
      );
      await sm.verifyRemoteBackend();
      pulled += rows.length;
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
      await sm.verifyRemoteBackend();
      applied += result.applied;
      conflictsResolved += result.conflictsResolved;
      historyInvalidated ||= result.applied > 0;
      progress = result.progress;
      if (!snapshotComplete) continue;
    } catch (error) {
      if (error instanceof RemoteBackendMismatchError) {
        await removeBucketScope(localAdapter, EntityType, repoSync, scope, progress);
      }
      throw error;
    }
  }

  let cursor = progress.cursor;
  try {
    do {
      await sm.verifyRemoteBackend();
      const changes = await pullScopedAncestorChanges(
        remoteAdapter,
        cursor,
        options.limit ?? 1000,
        scope,
        branchIds,
        filter
      );
      pulled += changes.length;
      hasMore = changes.length >= (options.limit ?? 1000);
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
      applied += result.applied;
      compacted += result.compacted;
      conflictsResolved += result.conflictsResolved;
      historyInvalidated ||= result.applied > 0;
      progress = result.progress;
      await sm.verifyRemoteBackend();
      cursor = progress.cursor;
    } while (hasMore && options.fetchAll);
  } catch (error) {
    if (error instanceof RemoteBackendMismatchError) {
      await removeBucketScope(localAdapter, EntityType, repoSync, scope, progress);
    }
    throw error;
  }

  return { pulled, compacted, applied, conflictsResolved, historyInvalidated, hasMore };
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
): Promise<{ progress: RxDBSyncBucketProgress; applied: number; conflictsResolved: number }> {
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
): Promise<{
  progress: RxDBSyncBucketProgress;
  applied: number;
  compacted: number;
  conflictsResolved: number;
}> {
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
    const entityRepository = executor.getRepository(EntityType);

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
    // findRowsWithoutMappings 按全部分区的映射与待推变更决定。直接删会把刚换进另一个已授权分区的行一起删掉
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

    const latestByEntityId = latestChangesByEntityId(safeChanges);
    const rowsToRemove = new Set<string>();
    const snapshotRunId = progress.snapshotRunId;
    for (const [entityId, change] of latestByEntityId) {
      const rowId = rowIdentity(scope, entityId);
      if (change.type === 'DELETE') {
        const row = await findBucketRow(rowRepository, rowId);
        if (row) await rowRepository.remove(row);
        rowsToRemove.add(entityId);
        continue;
      }

      const row = await findBucketRow(rowRepository, rowId);
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
      for (const row of stale.filter(row => row.snapshotRunId !== snapshotRunId)) {
        await rowRepository.remove(row);
        rowsToRemove.add(row.entityId);
      }
    }

    const cleanupIds = await findRowsWithoutMappings(
      rowRepository,
      entityRepository,
      changeRepository,
      scope,
      rowsToRemove,
      repoSync.lastPushedChangeId
    );
    for (const entityId of cleanupIds) {
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
      conflictsResolved: resolved.conflictsResolved
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
    } as never)
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
  } as never);
}

async function findBucketRow(
  repository: IRepository<typeof RxDBSyncBucketRow>,
  rowId: string
): Promise<RxDBSyncBucketRow | undefined> {
  return (
    await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: rowId }] }
    } as never)
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
