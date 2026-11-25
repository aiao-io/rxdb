/**
 * @fileoverview 远端身份：拉取游标只在它所属的远端上有效
 *
 * @remarks
 * 拉取游标是远端 change id，只在同一个远端库里单调。远端重建或变更日志清空重新计数之后，
 * 旧客户端的游标会越过新库的全部 id：拉取静默拉空，推送照常把本地变更写进一个没有它们前情的库。
 * 远端身份（`RxDBAdapterRemoteBase.backendId()`）因此与游标存在同一行（`RxDBSync.remoteBackendId`），
 * 与远端交换数据之前先比对：
 *
 * - 有记录绑在别的身份上：停止同步，抛 {@link RemoteBackendMismatchError} 并写进 `SyncState.lastError`，
 *   本地数据一行不动，由应用调 `syncManager.rebindRemoteBackend()` 决定改绑；
 * - 还没绑定的记录（系统 schema 9 之前写下的）：交换数据的入口把它们就地绑到当前身份，
 *   只读的状态查询只比对、不写。
 *
 * 入口比对一次不够：一次同步可能跑很久（多轮 fetchAll、逐仓先拉后推），远端在途中被重建，
 * 后面的往返就打在新库上。所以拉回的每一轮、推送的回执在落库之前再比对一次——
 * 前后两次都是同一个身份，夹在中间的那次往返才算这个远端上的进度，游标与水位才往前推。
 *
 * 不自动改绑：远端地址配错到另一个项目时，自动改绑会把别人的数据拉进来、把本地待推变更推过去。
 */
import {
  RxDBError,
  RxDBIdentityMismatchError,
  RxDBSync,
  type IRepository,
  type RxDBAdapterRemoteBase
} from '@aiao/rxdb';
import { removeBucketScopeInTransaction, type BucketScope } from './bucketed-scope-cleanup.js';
import { RxDBSyncBucketProgress, RxDBSyncIdentityBinding } from './scoped-sync.entity.js';
import {
  IdentityMismatchError,
  identityFingerprint,
  scopedIdentityKind,
  type ScopedSyncIdentity
} from './scoped-sync.js';
import type { SyncManager } from './SyncManager.js';

/**
 * 远端身份与本地同步记录所属的远端对不上
 *
 * @remarks
 * 远端被重建、变更日志被清空，或远端地址被改到另一个库时出现。同步停在原地，本地数据不动；
 * 确认新远端就是要同步的那一个之后调 `syncManager.rebindRemoteBackend()`，下一次拉取从头全量拉。
 */
export class RemoteBackendMismatchError extends RxDBError {
  constructor(
    /** 远端此刻报告的身份 */
    readonly backendId: string,
    /** 本地同步记录绑定的、与 {@link RemoteBackendMismatchError.backendId} 不同的身份（去重） */
    readonly boundBackendIds: readonly string[]
  ) {
    super(
      `Remote backend changed: local sync cursors belong to ${boundBackendIds.join(', ')} ` +
        `but the remote reports ${backendId}. Sync is stopped and local data is untouched; ` +
        `call syncManager.rebindRemoteBackend() once the new remote is confirmed.`
    );
    this.name = 'RemoteBackendMismatchError';
    Object.setPrototypeOf(this, RemoteBackendMismatchError.prototype);
  }
}

/**
 * `SyncManager.rebindRemoteBackend()` 的结果
 */
export interface RebindRemoteBackendResult {
  /** 改绑到的远端身份 */
  backendId: string;
  /** 被换掉的旧身份（去重）；原本未绑定的记录不计入 */
  previousBackendIds: string[];
  /** 拉取游标被清空并改绑的同步记录数 */
  rebound: number;
}

interface RemoteBackendCheck {
  backendId: string;
  repository: IRepository<typeof RxDBSync>;
  records: RxDBSync[];
}

const ALL_RECORDS = { where: { combinator: 'and' as const, rules: [] } };

type ScopedIdentityRemoteAdapter = RxDBAdapterRemoteBase & {
  syncIdentity(): Promise<ScopedSyncIdentity>;
};

const isScopedIdentityRemoteAdapter = (adapter: RxDBAdapterRemoteBase): adapter is ScopedIdentityRemoteAdapter =>
  typeof (adapter as unknown as { syncIdentity?: unknown }).syncIdentity === 'function';

const IDENTITY_BINDING_ID = 'singleton';
const IDENTITY_BINDING = {
  where: { combinator: 'and' as const, rules: [{ field: 'id', operator: '=', value: IDENTITY_BINDING_ID }] }
};

/**
 * 身份不匹配先写进 `SyncState.lastError` 再抛
 *
 * @remarks
 * 只有身份不匹配才写进面板：适配器不报告身份、写库失败这类是配置或环境问题，原样抛给调用方。
 */
const reportingIdentityMismatch = async (sm: SyncManager, step: () => Promise<void>): Promise<void> => {
  try {
    await step();
  } catch (error) {
    if (error instanceof RxDBIdentityMismatchError) sm.rxdb.syncState.reportError(error);
    throw error;
  }
};

/**
 * 与远端交换数据之前先核对调用者身份：对不上先写进 `SyncState.lastError` 再抛
 *
 * @remarks
 * 没声明身份时核心的 `assertCallerIdentity` 什么都不做，也不问远端。
 */
const assertRemoteIdentity = (sm: SyncManager, remote: RxDBAdapterRemoteBase): Promise<void> =>
  reportingIdentityMismatch(sm, () => sm.rxdb.assertCallerIdentity(remote));

/** 本地库已经绑定了身份：与当前会话对不上时先写进 `SyncState.lastError` 再抛 */
const assertBoundIdentity = (
  sm: SyncManager,
  binding: RxDBSyncIdentityBinding,
  identity: ScopedSyncIdentity,
  fingerprint: string
): void => {
  if (binding.identityFingerprint === fingerprint) return;
  const error = new IdentityMismatchError(
    binding.identityKind,
    scopedIdentityKind(identity),
    binding.identityFingerprint,
    fingerprint
  );
  sm.rxdb.syncState.reportError(error);
  throw error;
};

/**
 * 在读取远端 backend id 之前绑定并核对本地数据库身份
 *
 * @remarks
 * 声明了 `RxDBOptions.identity` 时先核对会话就是声明的身份，通过之后才写绑定：登错号的会话不能先把
 * 自己的指纹写进本地库——没有改绑，写错一次，换回正确的会话也再同步不了。
 *
 * 第一次绑定时先在同一个事务里写下核心的身份水位（`RxDB.bindIdentity`），再写本插件的绑定行。
 * 没声明身份时只写本插件这一行的话，应用之后改为声明身份打开同一个库，核心的打开守卫看不到绑定，
 * 会把装着这个会话数据的库就地绑给打开它的那个身份（RV-01a2118227d9715ab33e8ef2556bb4b6）。
 * 库已绑定别的身份（曾以别的身份声明打开）时核心抛身份不匹配，两行都不写。已有本插件绑定时只核对、不回填核心水位。
 */
export async function bindScopedIdentity(sm: SyncManager): Promise<void> {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  if (!isScopedIdentityRemoteAdapter(remoteAdapter)) return;
  await assertRemoteIdentity(sm, remoteAdapter);

  const identity = await remoteAdapter.syncIdentity();
  const fingerprint = identityFingerprint(identity);
  const { adapter: localAdapter } = await sm.getLocalRepositories();
  const repository = localAdapter.getRepository(RxDBSyncIdentityBinding);
  const existing = (await repository.find(IDENTITY_BINDING))[0];
  if (existing) return assertBoundIdentity(sm, existing, identity, fingerprint);

  await localAdapter.transaction(async executor => {
    const txRepository = executor.getRepository(RxDBSyncIdentityBinding);
    const current = (await txRepository.find(IDENTITY_BINDING))[0];
    if (current) return assertBoundIdentity(sm, current, identity, fingerprint);

    await reportingIdentityMismatch(sm, () => sm.rxdb.bindIdentity(executor, identity));
    const binding = Object.assign(sm.rxdb.entityManager.instantiate(RxDBSyncIdentityBinding), {
      id: IDENTITY_BINDING_ID,
      identityKind: scopedIdentityKind(identity),
      identityFingerprint: fingerprint,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await txRepository.create(binding);
  });
}

/** 读远端身份与本地全部同步记录 */
const readRemoteBackend = async (sm: SyncManager): Promise<RemoteBackendCheck> => {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  await assertRemoteIdentity(sm, remoteAdapter);
  const backendId = await remoteAdapter.backendId();
  const { adapter: localAdapter } = await sm.getLocalRepositories();
  const repository = localAdapter.getRepository(RxDBSync);
  return { backendId, repository, records: await repository.find(ALL_RECORDS) };
};

/** 记录上与 `backendId` 不同的已绑定身份（去重） */
const foreignBackendIds = (records: readonly RxDBSync[], backendId: string): string[] => [
  ...new Set(
    records.flatMap(record =>
      record.remoteBackendId && record.remoteBackendId !== backendId ? [record.remoteBackendId] : []
    )
  )
];

/** 停止同步：错误先写进 `SyncState.lastError` 再抛，面板上看得见 */
const stopOnMismatch = (sm: SyncManager, backendId: string, boundBackendIds: readonly string[]): never => {
  const error = new RemoteBackendMismatchError(backendId, boundBackendIds);
  sm.rxdb.syncState.reportError(error);
  throw error;
};

/**
 * 比对远端身份，只读不写
 *
 * @param sm - 同步管理器
 * @returns 远端身份与本地全部同步记录
 * @throws {@link RemoteBackendMismatchError} 有记录绑在别的身份上；同时写进 `SyncState.lastError`
 *
 * @internal
 */
export async function assertRemoteBackend(sm: SyncManager): Promise<RemoteBackendCheck> {
  const check = await readRemoteBackend(sm);
  const foreign = foreignBackendIds(check.records, check.backendId);
  if (foreign.length > 0) stopOnMismatch(sm, check.backendId, foreign);
  return check;
}

/**
 * 远端此刻的身份必须就是 `expected`
 *
 * @param sm - 同步管理器
 * @param remote - 远端适配器
 * @param expected - 调用方手上那份游标或截止 id 所属的远端身份
 * @throws {@link RemoteBackendMismatchError} 对不上时；同时写进 `SyncState.lastError`
 *
 * @remarks
 * 给不靠同步记录认远端的调用方用：分支物化把身份冻在意图里，首次物化时本地一条同步记录都没有，
 * 按记录比对拦不住冻结之后的远端重建。
 *
 * @internal
 */
export async function assertRemoteBackendIs(
  sm: SyncManager,
  remote: RxDBAdapterRemoteBase,
  expected: string
): Promise<void> {
  await assertRemoteIdentity(sm, remote);
  const backendId = await remote.backendId();
  if (backendId !== expected) stopOnMismatch(sm, backendId, [expected]);
}

/**
 * 比对远端身份，再把未绑定的记录绑到它上面
 *
 * @param sm - 同步管理器
 * @returns 已核实的远端身份
 * @throws {@link RemoteBackendMismatchError} 有记录绑在别的身份上；一行都不写
 *
 * @internal
 */
export async function bindRemoteBackend(sm: SyncManager): Promise<string> {
  const { backendId, repository, records } = await assertRemoteBackend(sm);
  for (const record of records) {
    if (!record.remoteBackendId) await repository.update(record, { remoteBackendId: backendId });
  }
  return backendId;
}

/**
 * 改绑到远端当前的身份，清空所有不属于它的拉取游标
 *
 * @param sm - 同步管理器
 * @returns 改绑结果
 *
 * @remarks
 * 一个事务里改完：改到一半失败时整体回滚，重调即可。推送水位不动，已推到旧远端的本地变更不会重推。
 *
 * @internal
 */
export async function rebindRemoteBackend(sm: SyncManager): Promise<RebindRemoteBackendResult> {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  await assertRemoteIdentity(sm, remoteAdapter);
  const backendId = await remoteAdapter.backendId();
  const { adapter: localAdapter } = await sm.getLocalRepositories();
  const result = await localAdapter.transaction(async executor => {
    const repository = executor.getRepository(RxDBSync);
    const allRecords = await repository.find(ALL_RECORDS);
    const records = allRecords.filter(record => record.remoteBackendId !== backendId);
    const progressRepository = executor.getRepository(RxDBSyncBucketProgress);
    const progresses = (await progressRepository.find(ALL_RECORDS)).filter(
      progress =>
        typeof progress.namespace === 'string' &&
        typeof progress.entity === 'string' &&
        typeof progress.branchId === 'string' &&
        typeof progress.bucket === 'string' &&
        typeof progress.filterFingerprint === 'string' &&
        progress.remoteBackendId !== backendId
    );
    const previousBackendIds = [
      ...new Set([
        ...foreignBackendIds(records, backendId),
        ...progresses.flatMap(progress =>
          progress.remoteBackendId && progress.remoteBackendId !== backendId ? [progress.remoteBackendId] : []
        )
      ])
    ];
    const updatedAt = new Date();
    for (const record of records) {
      await repository.update(record, { remoteBackendId: backendId, lastPullRemoteChangeId: null, updatedAt });
    }
    for (const progress of progresses) {
      const EntityType = sm.rxdb.schemaManager.getEntityType(progress.entity, progress.namespace);
      const repoSync =
        allRecords.find(
          record =>
            record.namespace === progress.namespace &&
            record.entity === progress.entity &&
            record.branchId === progress.branchId
        ) ??
        Object.assign(sm.rxdb.entityManager.instantiate(RxDBSync), {
          namespace: progress.namespace,
          entity: progress.entity,
          branchId: progress.branchId,
          lastPushedChangeId: null
        });
      const scope: BucketScope = {
        namespace: progress.namespace,
        entity: progress.entity,
        branchId: progress.branchId,
        bucket: progress.bucket,
        filterFingerprint: progress.filterFingerprint
      };
      await removeBucketScopeInTransaction(executor, EntityType, repoSync, scope, progress);
    }
    return { backendId, previousBackendIds, rebound: records.length };
  });
  const { syncState } = sm.rxdb;
  if (syncState.snapshot.lastError instanceof RemoteBackendMismatchError) syncState.reportSuccess();
  return result;
}

/**
 * 新建一条同步记录，盖上本实例最近一次核实的远端身份
 *
 * @param sm - 同步管理器
 * @returns 交给 `getOrCreateSyncRecord` 的新行
 *
 * @remarks
 * 游标从诞生起就带着所属的远端；等下一次入口再补绑，中间那次远端重建就会被当成同一个远端。
 *
 * @internal
 */
export const instantiateSyncRecord = (sm: SyncManager): RxDBSync =>
  Object.assign(sm.rxdb.entityManager.instantiate(RxDBSync), { remoteBackendId: sm.remoteBackendId });
