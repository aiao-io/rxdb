/**
 * 预检远程更新（不下载数据）
 * 此函数只查询远程有多少新变更，不会实际拉取数据
 * 用于"有 N 条更新"的场景，节省流量和时间
 *
 * User Story 2: 按需同步
 */

import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { RxDBSync } from '../system/sync.js';
import { getAncestorBranchIds } from './branch-utils.js';
import { needsPull } from './sync-type-utils.js';
// `RepositoryIdentifier` 此前在 4 个文件里各写了一份同形状定义，
// 统一收敛到 `VersionManager.interface.ts`（那份才是 `index.ts` 真正导出的）。
import type { RepositoryIdentifier } from './VersionManager.interface.js';

export type { RepositoryIdentifier };

/**
 * 仓库更新检查结果。
 */
export interface CheckRepositoryUpdatesResult {
  /**
   * Repository 标识
   */
  repository: RepositoryIdentifier;

  /**
   * 远程最新的 changeId
   */
  remoteLatestChangeId: number;

  /**
   * 本地最后拉取的远程 changeId
   */
  localLastPullRemoteChangeId: number | null;

  /**
   * 待拉取的变更数量
   */
  pendingCount: number;

  /**
   * 是否有更新
   */
  hasUpdates: boolean;
}

/**
 * 预检远程更新（不下载数据）
 *
 * @param rxdb - RxDB 实例
 * @param namespace - 命名空间
 * @param entity - 实体名称
 * @returns 更新检查结果
 *
 * @example
 * ```typescript
 * // 检查 Todo 是否有远程更新
 * const result = await checkRepositoryUpdates(rxdb, 'public', 'Todo');
 * if (result.hasUpdates) {
 *   console.log(`有 ${result.pendingCount} 条更新待拉取`);
 *   // 用户点击"更新"按钮后再调用 pullRepository()
 * }
 * ```
 */
export async function checkRepositoryUpdates(
  rxdb: RxDB,
  namespace: string,
  entity: string
): Promise<CheckRepositoryUpdatesResult> {
  const repository: RepositoryIdentifier = { namespace, entity };

  // 1. 检查同步配置
  const EntityType = rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });

  if (!EntityType) {
    throw new Error(`Entity not found: ${namespace}.${entity}`);
  }

  const metadata = getEntityMetadata(EntityType);

  // 如果不需要 pull（Local 或 None），直接返回无更新
  if (!needsPull(metadata, rxdb.config.sync)) {
    return {
      repository,
      remoteLatestChangeId: 0,
      localLastPullRemoteChangeId: null,
      pendingCount: 0,
      hasUpdates: false
    };
  }

  // 2. 获取 RxDBSync 记录
  const branch = await rxdb.versionManager.getCurrentBranch();
  const branchId = branch.id;

  const { adapter: localAdapter } = await rxdb.versionManager.getLocalRepositories();
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);
  const repoSyncId = `${namespace}:${entity}:${branchId}`;

  const repoSyncResults = await repoSyncRepo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: repoSyncId }]
    },
    limit: 1
  });

  const repoSync = repoSyncResults[0];
  const localLastPullRemoteChangeId = repoSync?.lastPullRemoteChangeId ?? null;

  // 3. 调用适配器的 getChangeCount() 查询远程变更数量
  const { adapter: remoteAdapter } = await rxdb.versionManager.getRemoteRepositories();
  if (!remoteAdapter) {
    throw new Error('Remote adapter not configured');
  }

  const sinceId = localLastPullRemoteChangeId ?? 0;
  // 计数范围必须和 pull 的拉取范围一致，否则这个函数就是在回答另一个问题：
  // `getChangeCount` 的 branchId 是精确匹配，只传当前分支时父分支上的新变更一条都不计入，
  // 于是 `hasUpdates` 报 false、界面显示「已全部同步」，而 pull 其实还有东西要拉。
  // 此前只传裸实体名，同名实体跨 namespace 存在时会解析歧义
  const branchIds = await getAncestorBranchIds(rxdb.versionManager, branchId);
  const perBranch = await Promise.all(
    branchIds.map(ancestorBranchId =>
      remoteAdapter.getChangeCount(sinceId, [`${namespace}:${metadata.name}`], ancestorBranchId)
    )
  );
  // 条数跨分支相加；`latestChangeId` 是同一个远端序列上的最大值，取 max 而非相加
  const count = perBranch.reduce((sum, item) => sum + item.count, 0);
  const latestChangeId = perBranch.reduce((max, item) => (item.latestChangeId > max ? item.latestChangeId : max), 0);
  // 4. 构造返回结果
  return {
    repository,
    remoteLatestChangeId: latestChangeId,
    localLastPullRemoteChangeId,
    pendingCount: count,
    hasUpdates: count > 0
  };
}
