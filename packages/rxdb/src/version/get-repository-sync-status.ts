/**
 * @fileoverview 获取仓库同步状态
 *
 * 提供查询单个仓库同步状态的功能，包含 syncType、pushableCount、pullableCount 以及最后同步时间戳等信息。
 */

import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import type { RxDBChangeRuleGroup, RxDBSyncRuleGroup } from '../system/types.js';
import { checkRepositoryUpdates } from './check-repository-updates.js';
import { getSyncCapability, getSyncType, isRepositorySyncEnabled, needsPull, needsPush } from './sync-type-utils.js';
// 唯一定义收敛到 `VersionManager.interface.ts`。
import type { RepositoryIdentifier } from './VersionManager.interface.js';

export type { RepositoryIdentifier };

/**
 * 同步类型的取值
 */
export type SyncTypeValue = 'full' | 'filter' | 'querycache' | 'remote' | 'local' | 'none';

/**
 * 仓库同步状态
 */
export interface RepositorySyncStatus {
  /**
   * 仓库标识
   */
  repository: RepositoryIdentifier;

  /**
   * 分支 ID
   */
  branchId: string;

  /**
   * 同步类型
   */
  syncType: SyncTypeValue;

  /**
   * 是否启用同步
   */
  enabled: boolean;

  /**
   * 最后一次推送的 changeId
   */
  lastPushedChangeId: number | null;

  /**
   * 最后一次推送时间戳
   */
  lastPushedAt: Date | null;

  /**
   * 最后一次拉取时间戳
   */
  lastPulledAt: Date | null;

  /**
   * 最后一次拉取到的远端 changeId
   */
  lastPullRemoteChangeId: number | null;

  /**
   * 待推送的变更数量
   */
  pushableCount: number;

  /**
   * 可供拉取的变更数量
   */
  pullableCount: number;
}

/**
 * 计算仓库的待推送变更数量
 *
 * 逻辑：
 * - 统计 RxDBChange 记录，满足以下条件：
 *   1. 属于该实体（entity 字段匹配）
 *   2. 属于当前分支
 *   3. 不是远端产生的（remoteId 为 null）
 *   4. 未被撤销（revertChangeId 为 null）
 *   5. 比 lastPushedChangeId 新（如果存在）
 *
 * @param rxdb - RxDB 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @param branchId - 当前分支 ID
 * @param lastPushedChangeId - 最后一次推送的 changeId（若未推送则为 null）
 * @returns 待推送的变更数量
 */
async function calculatePushableCount(
  rxdb: RxDB,
  namespace: string,
  entity: string,
  branchId: string,
  lastPushedChangeId: number | null
): Promise<number> {
  const { adapter: localAdapter } = await rxdb.versionManager.getLocalRepositories();
  const changeRepo = localAdapter.getRepository(RxDBChange);

  // 构建查询规则
  const rules: RxDBChangeRuleGroup['rules'] = [
    { field: 'namespace', operator: '=', value: namespace },
    { field: 'entity', operator: '=', value: entity },
    { field: 'branchId', operator: '=', value: branchId },
    { field: 'remoteId', operator: '=', value: null },
    { field: 'revertChangeId', operator: '=', value: null }
  ];

  // 如果存在 lastPushedChangeId，则添加过滤条件
  if (lastPushedChangeId !== null) {
    rules.push({ field: 'id', operator: '>', value: lastPushedChangeId });
  }

  const result = await changeRepo.find({
    where: {
      combinator: 'and',
      rules
    }
  });

  return result.length;
}

/**
 * 计算仓库可拉取变更的数量
 *
 * 使用 checkRepositoryUpdates() 查询远端变更计数，避免下载实际数据。
 *
 * @param rxdb - RxDB 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @returns 可拉取的变更数量
 */
async function calculatePullableCount(rxdb: RxDB, namespace: string, entity: string): Promise<number> {
  const result = await checkRepositoryUpdates(rxdb, namespace, entity);
  return result.pendingCount;
}

/**
 * 获取单个仓库的同步状态
 *
 * @param rxdb - RxDB 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @returns 仓库同步状态
 *
 * @example
 * ```typescript
 * const status = await getRepositorySyncStatus(rxdb, 'public', 'Todo');
 * console.log(`Sync type: ${status.syncType}`);
 * console.log(`Pushable: ${status.pushableCount}, Pullable: ${status.pullableCount}`);
 * ```
 */
export async function getRepositorySyncStatus(
  rxdb: RxDB,
  namespace: string,
  entity: string
): Promise<RepositorySyncStatus> {
  // 1. 查找实体类并获取元数据
  const EntityClass = rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });

  if (!EntityClass) {
    throw new Error(`Entity not found: ${namespace}.${entity}`);
  }

  const metadata = getEntityMetadata(EntityClass);
  const syncType = getSyncType(metadata, rxdb.config.sync);
  const syncCapability = getSyncCapability(syncType);

  // 2. 获取当前分支
  const branch = await rxdb.versionManager.getCurrentBranch();
  const branchId = branch.id;

  // 3. 查询 RxDBSync 记录
  const { adapter: localAdapter } = await rxdb.versionManager.getLocalRepositories();
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);
  const repoSyncId = `${namespace}:${entity}:${branchId}`;

  const repoSyncWhere: RxDBSyncRuleGroup = {
    combinator: 'and',
    rules: [{ field: 'id', operator: '=', value: repoSyncId }]
  };

  const repoSyncResults = await repoSyncRepo.find({ where: repoSyncWhere, limit: 1 });

  const repoSync = repoSyncResults.length > 0 ? repoSyncResults[0] : null;

  // 4. 计算 pushableCount 和 pullableCount
  let pushableCount = 0;
  let pullableCount = 0;

  // 如果该实体需要推送，则计算 pushableCount（与 syncType 一致地传入全局 sync 回退）
  if (needsPush(metadata, rxdb.config.sync)) {
    pushableCount = await calculatePushableCount(
      rxdb,
      namespace,
      entity,
      branchId,
      repoSync?.lastPushedChangeId ?? null
    );
  }

  // 如果该实体需要拉取，则计算 pullableCount（与 syncType 一致地传入全局 sync 回退）
  if (needsPull(metadata, rxdb.config.sync)) {
    pullableCount = await calculatePullableCount(rxdb, namespace, entity);
  }

  // 5. 构建并返回状态
  return {
    repository: { namespace, entity },
    branchId,
    syncType,
    // 口径与调度侧同源 —— 两个方向都不可同步的（`none` / `local`）恒为
    // 关闭；有能力时才由 `RxDBSync.enabled` 说了算（记录还没懒创建 ⇒ 启用）
    enabled: syncCapability.pull || syncCapability.push ? isRepositorySyncEnabled(repoSync) : false,
    lastPushedChangeId: repoSync?.lastPushedChangeId ?? null,
    lastPushedAt: repoSync?.lastPushedAt ?? null,
    lastPulledAt: repoSync?.lastPulledAt ?? null,
    lastPullRemoteChangeId: repoSync?.lastPullRemoteChangeId ?? null,
    pushableCount,
    pullableCount
  };
}
