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
 * 不自动改绑：远端地址配错到另一个项目时，自动改绑会把别人的数据拉进来、把本地待推变更推过去。
 */
import { type IRepository, RxDBError, RxDBSync } from '@aiao/rxdb';
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

/** 读远端身份与本地全部同步记录 */
const readRemoteBackend = async (sm: SyncManager): Promise<RemoteBackendCheck> => {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
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
  if (foreign.length > 0) {
    const error = new RemoteBackendMismatchError(check.backendId, foreign);
    sm.rxdb.syncState.reportError(error);
    throw error;
  }
  return check;
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
 * 一个事务里改完：改到一半失败时整体回滚，重调即可。只动拉取游标；推送水位不动，
 * 已推到旧远端的本地变更不会重推。
 *
 * @internal
 */
export async function rebindRemoteBackend(sm: SyncManager): Promise<RebindRemoteBackendResult> {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  const backendId = await remoteAdapter.backendId();
  const { adapter: localAdapter } = await sm.getLocalRepositories();
  const result = await localAdapter.transaction(async executor => {
    const repository = executor.getRepository(RxDBSync);
    const records = (await repository.find(ALL_RECORDS)).filter(record => record.remoteBackendId !== backendId);
    const previousBackendIds = foreignBackendIds(records, backendId);
    const updatedAt = new Date();
    for (const record of records) {
      await repository.update(record, { remoteBackendId: backendId, lastPullRemoteChangeId: null, updatedAt });
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
