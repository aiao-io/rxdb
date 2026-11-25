/**
 * 预检远程更新（不下载数据）
 * 此函数只查询远程有多少新变更，不会实际拉取数据
 * 用于"有 N 条更新"的场景，节省流量和时间
 *
 * User Story 2: 按需同步
 */

import { getEntityMetadata, getSyncType, needsPull, type RepositoryIdentifier, type RxDB, RxDBSync } from '@aiao/rxdb';
import { getAncestorBranchIds } from './branch-utils.js';
import { resolveConfiguredFilter } from './pull-repository.js';
import { assertRemoteBackend } from './remote-backend.js';
import { RxDBSyncBucketProgress } from './scoped-sync.entity.js';
import { filterFingerprint, type ScopedSyncAdapter } from './scoped-sync.js';
// `RepositoryIdentifier` 此前在 4 个文件里各写了一份同形状定义，
// 统一收敛到 `VersionManager.interface.ts`（那份才是 `index.ts` 真正导出的）。
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
  if (!needsPull(metadata, rxdb.entitySync)) {
    return {
      repository,
      remoteLatestChangeId: 0,
      localLastPullRemoteChangeId: null,
      pendingCount: 0,
      hasUpdates: false
    };
  }

  // 2. 获取 RxDBSync 记录
  // 槽位只解析这一次：断连会把 `rxdb.syncManager` 删掉，一次查询里重解析四回
  // 等于给自己留四个 `undefined` 的窗口。
  const sm = rxdb.syncManager;
  const branch = await sm.getCurrentBranch();
  const branchId = branch.id;

  const { adapter: localAdapter } = await sm.getLocalRepositories();
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
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();
  if (!remoteAdapter) {
    throw new Error('Remote adapter not configured');
  }
  // 游标属于另一个远端时，拿它去数只会数出一个看似可信的 0。状态查询只读，只比对、不绑定。
  await assertRemoteBackend(sm);

  const scopedRemote = remoteAdapter as typeof remoteAdapter & Partial<ScopedSyncAdapter>;
  if (
    typeof scopedRemote.getCallerBuckets === 'function' &&
    typeof scopedRemote.getEntitySyncInfo === 'function' &&
    typeof scopedRemote.getBucketSnapshotPoint === 'function' &&
    (await scopedRemote.getEntitySyncInfo(namespace, entity)).bucketed
  ) {
    const progressRepository = localAdapter.getRepository(RxDBSyncBucketProgress);
    const progresses = await progressRepository.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'namespace', operator: '=', value: namespace },
          { field: 'entity', operator: '=', value: entity },
          { field: 'branchId', operator: '=', value: branchId }
        ]
      }
    } as never);
    const getCallerBuckets = scopedRemote.getCallerBuckets.bind(scopedRemote);
    const getBucketSnapshotPoint = scopedRemote.getBucketSnapshotPoint.bind(scopedRemote);
    const buckets = [...new Set(await getCallerBuckets())];
    // 水位与拉取同口径：拉取只拉当前分支及其祖先，别的分支写进同一个 bucket 不算待拉
    const ancestorBranchIds = await getAncestorBranchIds(sm, branchId);
    // 进度按同步规则指纹分开记：规则改过、旧指纹的进度还没清（某个区拉失败时会留下）时，只看 pull() 会用的那一份
    const fingerprint = filterFingerprint(
      resolveConfiguredFilter(rxdb, metadata, getSyncType(metadata, rxdb.entitySync))
    );
    let pendingCount = 0;
    let latestChangeId = 0;
    let localCursor: number | null = null;

    for (const bucket of buckets) {
      const progress = progresses.find(item => item.bucket === bucket && item.filterFingerprint === fingerprint);
      const remotePoint = await snapshotPointUnlessRevoked(
        () => getBucketSnapshotPoint(namespace, entity, bucket, ancestorBranchIds),
        getCallerBuckets,
        bucket
      );
      if (remotePoint === undefined) continue;
      latestChangeId = Math.max(latestChangeId, remotePoint);
      if (progress) localCursor = Math.max(localCursor ?? 0, progress.cursor);
      if (!progress || !progress.snapshotComplete || remotePoint > progress.cursor) {
        pendingCount += progress?.snapshotComplete ? Math.max(1, remotePoint - progress.cursor) : 1;
      }
    }

    return {
      repository,
      remoteLatestChangeId: latestChangeId,
      localLastPullRemoteChangeId: localCursor,
      pendingCount,
      hasUpdates: pendingCount > 0
    };
  }

  const sinceId = localLastPullRemoteChangeId ?? 0;
  // 计数范围必须和 pull 的拉取范围一致，否则这个函数就是在回答另一个问题：
  // `getChangeCount` 的 branchId 是精确匹配，只传当前分支时父分支上的新变更一条都不计入，
  // 于是 `hasUpdates` 报 false、界面显示「已全部同步」，而 pull 其实还有东西要拉。
  // 此前只传裸实体名，同名实体跨 namespace 存在时会解析歧义
  const branchIds = await getAncestorBranchIds(sm, branchId);
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

/**
 * 分区此刻的快照点；问的时候分区已被撤销则为 `undefined`
 *
 * @param getSnapshotPoint - 问这个分区的快照点
 * @param getCallerBuckets - 问调用者此刻可读的分区
 * @param bucket - 要问的分区
 * @returns 快照点；重读可读分区确认它已不在时为 `undefined`
 *
 * @remarks
 * 先问可读分区、再逐个问快照点，两次之间分区可能被撤销，服务端对它报未授权（参考 SQL 是 `42501`）。
 * 不按错误码猜是不是撤销：失败之后重读一次可读分区，确实不在了才跳过，下一次拉取会清掉它的本地范围，
 * 与拉取逐分区记失败的口径一致（RV-01a21194e68f7aacb5782c196d2ea870）。还在列表里，或者重读本身也失败，
 * 就原样抛出原来的错误：网络与配置错误不能被当成撤销吞掉。
 */
async function snapshotPointUnlessRevoked(
  getSnapshotPoint: () => Promise<number>,
  getCallerBuckets: () => Promise<string[]>,
  bucket: string
): Promise<number | undefined> {
  try {
    return await getSnapshotPoint();
  } catch (error) {
    const stillReadable = await getCallerBuckets().then(
      buckets => buckets.includes(bucket),
      () => true
    );
    if (stillReadable) throw error;
    return undefined;
  }
}
