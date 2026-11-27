import {
  declareTrustedWrite,
  getRxDBEntityIdentityKey,
  parseRxDBEntityIdentityKey,
  repositoryKey,
  RxDBChange,
  RxDBSync,
  TrustedWriteIntent,
  type EntityType,
  type IRepository,
  type RxDBAdapterLocalBase,
  type RxDBEntityId,
  type TransactionExecutor
} from '@aiao/rxdb';
import { RxDBBucketCleanupBlockedError } from './bucket-cleanup-blocked-error.js';
import { blockingForeignKeysTo, findBlockingReferences, type CleanupCandidate } from './bucket-cleanup-references.js';
import { createEmptyActions, queryPendingLocalChanges } from './pull-conflict-utils.js';
import { RxDBSyncBucketProgress, RxDBSyncBucketRow } from './scoped-sync.entity.js';
import { assertSyncOnMainCheckout } from './sync-manager.utils.js';

export interface BucketScope {
  namespace: string;
  entity: string;
  branchId: string;
  bucket: string;
  filterFingerprint: string;
}

export async function removeBucketScope(
  localAdapter: RxDBAdapterLocalBase,
  entities: readonly EntityType[],
  EntityType: EntityType,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress
): Promise<RxDBBucketCleanupBlockedError | undefined> {
  return localAdapter.transaction(executor =>
    removeBucketScopeInTransaction(executor, entities, EntityType, repoSync, scope, progress)
  );
}

/**
 * 删掉一个分区作用域：映射行、只由它同步来且没有待推变更的本地行，以及它的进度行
 *
 * @param executor - 所在事务
 * @param entities - 本实例的全部实体：找出还引用着要删的行的那些
 * @param EntityType - 作用域的实体；本实例已经不认识它时为 `undefined`，只删映射与进度
 * @param repoSync - 仓库的同步记录：推送水位决定哪些本地变更还没推
 * @param scope - 要删的作用域
 * @param progress - 它的进度行
 * @returns 还被本地别的行引用、这次删不掉的行；全部清掉时为 `undefined`
 *
 * @remarks
 * 删不掉的行连同它们在这个作用域的映射与进度行一起留着：进度行还在，下一次拉取会再清一次，
 * 引用它们的行没了就删得掉（见 {@link RxDBBucketCleanupBlockedError}）。
 */
export async function removeBucketScopeInTransaction(
  executor: TransactionExecutor,
  entities: readonly EntityType[],
  EntityType: EntityType | undefined,
  repoSync: RxDBSync,
  scope: BucketScope,
  progress: RxDBSyncBucketProgress
): Promise<RxDBBucketCleanupBlockedError | undefined> {
  // 要删业务行：同步跑到一半换挂到可写检出位时，本事务落在那套表上就一行都不动（US-314 B1.4）
  assertSyncOnMainCheckout(executor.tableSet, 'removeBucketScope');
  const rowRepository = executor.getRepository(RxDBSyncBucketRow);
  const rows = await findBucketRows(rowRepository, scope);
  const plan =
    EntityType ?
      await planRowCleanup(
        executor,
        entities,
        EntityType,
        scope,
        rows.map(row => row.entityId),
        repoSync.lastPushedChangeId
      )
    : EMPTY_CLEANUP_PLAN;
  for (const row of rows.filter(row => !plan.retained.has(row.entityId))) await rowRepository.remove(row);

  const actions = createEmptyActions();
  for (const entityId of plan.deletable) {
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
  if (plan.blocked) return plan.blocked;
  await executor.getRepository(RxDBSyncBucketProgress).remove(progress);
  return undefined;
}

/** 一次清理要删、要留的本地行 */
export interface RowCleanupPlan {
  /** 可以删的行：映射表里存的实体身份 */
  readonly deletable: readonly string[];
  /** 还被本地别的行引用、这次留下的行 */
  readonly retained: ReadonlySet<string>;
  /** 留下的原因；没有留下的行时为 `undefined` */
  readonly blocked: RxDBBucketCleanupBlockedError | undefined;
}

const EMPTY_CLEANUP_PLAN: RowCleanupPlan = { deletable: [], retained: new Set(), blocked: undefined };

/**
 * 离开一个作用域的行里，哪些从本机删掉、哪些留下
 *
 * @param executor - 清理所在的事务
 * @param entities - 本实例的全部实体
 * @param EntityType - 作用域的实体
 * @param scope - 行要离开的作用域；它自己的映射不算「还有别的分区在同步这行」
 * @param entityIds - 离开的行（映射表里存的实体身份）
 * @param lastPushedChangeId - 推送水位：之后的本地变更还没推
 * @returns 只由这个作用域同步来、没有待推变更的行里，没被引用的删、被引用的留
 *
 * @remarks
 * 被引用的行不删：外键是 `RESTRICT` / `NO ACTION` 时，删它会让整个事务回滚，
 * 别的行、进度连同同一实体的其他分区都跟着推进不了。
 */
export async function planRowCleanup(
  executor: TransactionExecutor,
  entities: readonly EntityType[],
  EntityType: EntityType,
  scope: BucketScope,
  entityIds: Iterable<string>,
  lastPushedChangeId: number | null
): Promise<RowCleanupPlan> {
  const candidates = await findRowsWithoutMappings(
    executor.getRepository(RxDBSyncBucketRow),
    executor.getRepository(EntityType),
    executor.getRepository(RxDBChange),
    scope,
    entityIds,
    lastPushedChangeId
  );
  const target = { namespace: scope.namespace, entity: scope.entity };
  const references = await findBlockingReferences(
    executor,
    target,
    blockingForeignKeysTo(entities, target),
    candidates
  );
  if (references.size === 0) {
    return { deletable: candidates.map(candidate => candidate.entityId), retained: new Set(), blocked: undefined };
  }
  const retained = new Set(references.keys());
  const referencedBy = [...new Map([...references.values()].flat().map(repo => [repositoryKey(repo), repo])).values()];
  return {
    deletable: candidates.map(candidate => candidate.entityId).filter(entityId => !retained.has(entityId)),
    retained,
    blocked: new RxDBBucketCleanupBlockedError(
      target,
      scope.bucket,
      candidates
        .filter(candidate => retained.has(candidate.entityId))
        .map(candidate => Reflect.get(candidate.entity, 'id') as RxDBEntityId),
      referencedBy
    )
  };
}

/**
 * 离开作用域、且再没有别的分区在同步、也没有待推变更的本地行
 *
 * @remarks
 * `scope` 自己的映射不算：调用方此时还没删它们，删不删取决于这里的结果与引用检查。
 */
export async function findRowsWithoutMappings(
  rowRepository: IRepository<typeof RxDBSyncBucketRow>,
  entityRepository: IRepository<EntityType>,
  changeRepository: IRepository<typeof RxDBChange>,
  scope: BucketScope,
  entityIds: Iterable<string>,
  lastPushedChangeId: number | null
): Promise<CleanupCandidate[]> {
  const result: CleanupCandidate[] = [];
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
    const remaining = (await findRowsByEntityId(rowRepository, scope, entityId)).filter(row => !isInScope(row, scope));
    if (remaining.length > 0 || pending.has(scopedEntityKey(scope, entityId))) continue;
    const entity = await findLocalEntity(entityRepository, entityId);
    if (entity) result.push({ entityId, entity });
  }
  return result;
}

/** 映射行属于这个作用域（同一分区、同一规则指纹） */
function isInScope(row: RxDBSyncBucketRow, scope: BucketScope): boolean {
  return row.bucket === scope.bucket && row.filterFingerprint === scope.filterFingerprint;
}

async function findLocalEntity(
  repository: IRepository<EntityType>,
  entityIdentity: string
): Promise<InstanceType<EntityType> | null> {
  for (const candidate of localIdCandidatesFromStoredIdentity(entityIdentity)) {
    const rows = await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: candidate }] }
    });
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
  });
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
  });
}

export function entityIdentityKey(entityId: RxDBEntityId): string {
  return getRxDBEntityIdentityKey(entityId);
}
