import {
  declareTrustedWrite,
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey,
  RxDBChange,
  RxDBSync,
  TrustedWriteIntent,
  type EntityType,
  type IRepository,
  type RxDBAdapterLocalBase,
  type RxDBEntityId,
  type TransactionExecutor
} from '@aiao/rxdb';
import { createEmptyActions, queryPendingLocalChanges } from './pull-conflict-utils.js';
import { RxDBSyncBucketProgress, RxDBSyncBucketRow } from './scoped-sync.entity.js';

export interface BucketScope {
  namespace: string;
  entity: string;
  branchId: string;
  bucket: string;
  filterFingerprint: string;
}

export async function removeBucketScope(
  localAdapter: RxDBAdapterLocalBase,
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress
): Promise<boolean> {
  return localAdapter.transaction(executor =>
    removeBucketScopeInTransaction(executor, EntityType, repoSync, scope, progress)
  );
}

export async function removeBucketScopeInTransaction(
  executor: TransactionExecutor,
  EntityType: EntityType | undefined,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress
): Promise<boolean> {
  const rowRepository = executor.getRepository(RxDBSyncBucketRow);
  const progressRepository = executor.getRepository(RxDBSyncBucketProgress);
  const changeRepository = executor.getRepository(RxDBChange);
  const rows = await findBucketRows(rowRepository, scope);
  const entityIds = new Set(rows.map(row => row.entityId));
  for (const row of rows) await rowRepository.remove(row);

  let cleanupIds: string[] = [];
  if (EntityType) {
    const entityRepository = executor.getRepository(EntityType);
    cleanupIds = await findRowsWithoutMappings(
      rowRepository,
      entityRepository,
      changeRepository,
      scope,
      entityIds,
      repoSync.lastPushedChangeId
    );
  }

  const actions = createEmptyActions();
  for (const entityId of cleanupIds) {
    actions.deletes.set(scopedEntityKey(scope, entityId), { patch: null, inversePatch: null });
  }
  if (actions.deletes.size > 0) {
    declareTrustedWrite(executor, {
      file: 'bucketed-scope-cleanup.ts',
      symbol: 'removeBucketScopeInTransaction',
      intent: TrustedWriteIntent.remote_sync
    });
    await executor.mergeChanges(actions, undefined, true);
  }
  await progressRepository.remove(progress);
  return rows.length > 0 || actions.deletes.size > 0 || progress.id.length > 0;
}

export async function findRowsWithoutMappings(
  rowRepository: IRepository<typeof RxDBSyncBucketRow>,
  entityRepository: IRepository<EntityType>,
  changeRepository: IRepository<typeof RxDBChange>,
  scope: BucketScope,
  entityIds: Iterable<string>,
  lastPushedChangeId: number | null
): Promise<string[]> {
  const result: string[] = [];
  const ids = [...new Set(entityIds)];
  if (ids.length === 0) return result;
  const pending = await queryPendingLocalChanges(
    changeRepository,
    scope.namespace,
    scope.entity,
    scope.branchId,
    lastPushedChangeId,
    ids.flatMap(localIdCandidatesFromStoredIdentity)
  );
  for (const entityId of ids) {
    const remaining = await findRowsByEntityId(rowRepository, scope, entityId);
    if (remaining.length > 0 || pending.has(scopedEntityKey(scope, entityId))) continue;
    const localEntity = await findLocalEntity(entityRepository, entityId);
    if (localEntity) result.push(entityId);
  }
  return result;
}

async function findLocalEntity(
  repository: IRepository<EntityType>,
  entityIdentity: string
): Promise<InstanceType<EntityType> | null> {
  for (const candidate of localIdCandidatesFromStoredIdentity(entityIdentity)) {
    const rows = await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: candidate }] }
    } as never);
    if (rows[0]) return rows[0];
  }
  return null;
}

export function localIdCandidates(entityId: RxDBEntityId): RxDBEntityId[] {
  const result: RxDBEntityId[] = [entityId];
  if (typeof entityId === 'string' && /^-?(?:0|[1-9]\d*)$/.test(entityId)) {
    const number = Number(entityId);
    if (Number.isSafeInteger(number)) result.push(number);
  }
  return result;
}

export function localIdCandidatesFromStoredIdentity(entityIdentity: string): RxDBEntityId[] {
  const parsed = entityIdentity.startsWith('rxid1:') ? parseRxDBEntityIdentityKey(entityIdentity) : entityIdentity;
  return localIdCandidates(parsed);
}

export function scopedEntityKey(scope: BucketScope, entityIdentity: string): string {
  return `${scope.namespace}:${scope.entity}:${entityIdentity}`;
}

export async function findBucketRows(
  repository: IRepository<typeof RxDBSyncBucketRow>,
  scope: BucketScope
): Promise<RxDBSyncBucketRow[]> {
  return repository.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'namespace', operator: '=', value: scope.namespace },
        { field: 'entity', operator: '=', value: scope.entity },
        { field: 'branchId', operator: '=', value: scope.branchId },
        { field: 'bucket', operator: '=', value: scope.bucket },
        { field: 'filterFingerprint', operator: '=', value: scope.filterFingerprint }
      ]
    },
    orderBy: [{ field: 'entityId', sort: 'asc' }]
  } as never);
}

async function findRowsByEntityId(
  repository: IRepository<typeof RxDBSyncBucketRow>,
  scope: BucketScope,
  entityId: string
): Promise<RxDBSyncBucketRow[]> {
  return repository.find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'namespace', operator: '=', value: scope.namespace },
        { field: 'entity', operator: '=', value: scope.entity },
        { field: 'branchId', operator: '=', value: scope.branchId },
        { field: 'entityId', operator: '=', value: entityId }
      ]
    }
  } as never);
}

export function entityIdentityKey(entityId: RxDBEntityId): string {
  return getRxDBEntityIdentityKey(entityId);
}
