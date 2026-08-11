/**
 * @packageDocumentation
 * 同步记录工具模块
 * 提供同步记录的创建和获取功能
 */
import type { IRepository } from '../repository/repository.interface.js';
import { RxDBSync } from '../system/sync.js';
import { pullIneligibility, pushIneligibility } from './cascade-contract.js';
import type { RepositorySyncType } from './sync-type-utils.js';
import type { VersionManager } from './VersionManager.js';

export interface GetOrCreateSyncRecordParams {
  namespace: string;
  entity: string;
  branchId: string;
  syncType: RepositorySyncType;
}

/** 按主键读一条同步记录 */
const findSyncRecord = async (
  repoSyncRepo: IRepository<typeof RxDBSync>,
  syncId: string
): Promise<RxDBSync | undefined> =>
  (
    await repoSyncRepo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: syncId }] },
      limit: 1
    })
  )[0];

/**
 * 读取某个 repository 在**当前分支**上的同步记录（只读，不创建）
 *
 * @param vm - 版本管理器
 * @param namespace - 命名空间
 * @param entity - 实体名
 * @returns 同步记录；从未同步过（记录尚未懒创建）时返回 `undefined`
 *
 * @remarks
 * 资格判定（{@link pullIneligibility} / {@link pushIneligibility}）需要 `enabled`，
 * 但它必须发生在**碰远端之前**，而 {@link getOrCreateSyncRecord} 的调用点在拉/推流程内部、
 * 已经晚了。这里刻意只读不创建：判定阶段就写一条系统记录，会让「问一句能不能同步」
 * 变成一次写事务。
 *
 * @internal
 */
export async function findCurrentSyncRecord(
  vm: VersionManager,
  namespace: string,
  entity: string
): Promise<RxDBSync | undefined> {
  const { adapter } = await vm.getLocalRepositories();
  const branch = await vm.getCurrentBranch();
  return findSyncRecord(adapter.getRepository(RxDBSync), `${namespace}:${entity}:${branch.id}`);
}

/**
 * 判定某个 repository 当前能否拉取（syncType + `RxDBSync.enabled` 两道）
 *
 * @param vm - 版本管理器
 * @param namespace - 命名空间
 * @param entity - 实体名
 * @param syncType - 已解析的同步类型
 * @returns 不具备资格时返回可读原因，具备资格时返回 `undefined`
 *
 * @remarks
 * syncType 先判、**判负就直接返回**，一条系统记录都不读：一个 `none` 仓库没有理由
 * 为了「被拒绝」先开一次本地库。只有 syncType 这关过了，`enabled` 才有意义。
 *
 * @internal
 */
export async function resolvePullIneligibility(
  vm: VersionManager,
  namespace: string,
  entity: string,
  syncType: RepositorySyncType
): Promise<string | undefined> {
  const bySyncType = pullIneligibility(syncType);
  if (bySyncType) return bySyncType;
  return pullIneligibility(syncType, await findCurrentSyncRecord(vm, namespace, entity));
}

/**
 * 判定某个 repository 当前能否推送（syncType + `RxDBSync.enabled` 两道）
 *
 * @param vm - 版本管理器
 * @param namespace - 命名空间
 * @param entity - 实体名
 * @param syncType - 已解析的同步类型
 * @returns 不具备资格时返回可读原因，具备资格时返回 `undefined`
 *
 * @remarks
 * 短路规则同 {@link resolvePullIneligibility}。
 *
 * @internal
 */
export async function resolvePushIneligibility(
  vm: VersionManager,
  namespace: string,
  entity: string,
  syncType: RepositorySyncType
): Promise<string | undefined> {
  const bySyncType = pushIneligibility(syncType);
  if (bySyncType) return bySyncType;
  return pushIneligibility(syncType, await findCurrentSyncRecord(vm, namespace, entity));
}

/**
 * 取出（或首次创建）某个 repository/branch 的同步水位记录
 *
 * @remarks
 * `find` 与 `create` 之间没有原子性：同一个 repository 上并发的首次同步（例如同时触发
 * push 和 pull —— `HistoryManager.syncing()` 只置了一个布尔标志，并不串行化）会让两个
 * 任务都查不到记录、都去 create。
 *
 * `id` 就是 `${namespace}:${entity}:${branchId}`，本身是主键，所以写不出重复行；
 * 代价是后到的那次稳定撞主键冲突，整条同步随之失败。这里在 create 失败后按主键重读一次：
 * 记录已经在了就复用（说明是竞态），否则原样抛出（说明是真的写失败）。
 */
export async function getOrCreateSyncRecord(
  repoSyncRepo: IRepository<typeof RxDBSync>,
  params: GetOrCreateSyncRecordParams,
  instantiate: () => RxDBSync
): Promise<RxDBSync> {
  const { namespace, entity, branchId, syncType } = params;
  const syncId = `${namespace}:${entity}:${branchId}`;

  const existing = await findSyncRecord(repoSyncRepo, syncId);
  if (existing) {
    return existing;
  }

  const newRepoSync = instantiate();
  newRepoSync.id = syncId;
  newRepoSync.namespace = namespace;
  newRepoSync.entity = entity;
  newRepoSync.branchId = branchId;
  newRepoSync.syncType = syncType;
  newRepoSync.lastPushedChangeId = null;
  newRepoSync.lastPushedAt = null;
  newRepoSync.lastPulledAt = null;
  newRepoSync.lastPullRemoteChangeId = null;
  newRepoSync.enabled = true;
  newRepoSync.createdAt = new Date();
  newRepoSync.updatedAt = new Date();

  try {
    return await repoSyncRepo.create(newRepoSync);
  } catch (error) {
    // 竞态：另一个任务在我们 find 之后、create 之前把同一条记录写进去了
    const raced = await findSyncRecord(repoSyncRepo, syncId);
    if (raced) return raced;
    throw error;
  }
}
