/**
 * @fileoverview 批量拉取实现
 *
 * 将多个实体的 pull 操作合并为单次 HTTP 请求，
 * 替代原来的 bulkSync 逐实体拉取方式。
 *
 * 核心优化：
 * - 一次请求获取所有实体变更（通过 OR 过滤不同实体的水位线）
 * - 按依赖拓扑顺序处理结果（父 → 子）
 * - 支持祖先分支数据拉取
 */

import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import type { PullBatchRequest } from '../rxdb-adapter.js';
import type { RxDBEvent } from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import type { RemoteChange } from '../system/system.interface.js';
import { LWWConflictResolver } from './LWWConflictResolver.js';
import type { PullResult } from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';
import { getAncestorBranchIds } from './branch-utils.js';
import { compactChanges } from './compact-changes.js';
import type { ConflictResolver } from './conflict.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { pullAncestorBranchChanges } from './pull-ancestor-changes.js';
import {
  countActions,
  createConflictActionEntries,
  createEmptyActions,
  queryPendingLocalChanges,
  resolveConflictsAndBuildActions
} from './pull-conflict-utils.js';
import { getOrCreateSyncRecord } from './sync-record-utils.js';
import { getSyncCapability, getSyncType, isRepositorySyncEnabled } from './sync-type-utils.js';
import { topologicalSortForPull } from './topological-sort.js';

interface RepoSyncInfo {
  namespace: string;
  entity: string;
  syncId: string;
  repoSync: RxDBSync;
  lastPullRemoteChangeId: number;
  syncType: string;
}

/**
 * 单轮拉取的最大轮数，防止远端水位线不推进时无限循环。
 *
 * 正常情况下每轮都会把 `lastPullRemoteChangeId` 推到本轮最大 id，循环必然收敛；
 * 这个上限只在远端行为异常（返回的变更 id 不推进）时兜底。
 */
const MAX_FETCH_ALL_ROUNDS = 1000;

/**
 * 批量拉取所有实体的变更。
 *
 * @param vm - VersionManager 实例
 * @param options.limit - 每个实体单轮的最大变更数，默认 1000
 * @param options.fetchAll - 为真时循环拉取直到远端排空；默认只拉一轮并用 `hasMore` 告知还有剩余
 * @returns 各轮累加后的拉取结果
 */
export async function pullBatch(
  vm: VersionManager,
  options?: { limit?: number; fetchAll?: boolean; conflictResolver?: ConflictResolver }
): Promise<PullResult> {
  if (options?.fetchAll !== true) return await pullBatchOnce(vm, options?.limit, options?.conflictResolver);

  const total: PullResult = {
    pulled: 0,
    compacted: 0,
    applied: 0,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: false,
    historyInvalidated: false,
    failures: []
  };

  const accumulate = (result: PullResult): void => {
    total.pulled += result.pulled;
    total.compacted += result.compacted;
    total.applied += result.applied;
    total.conflictsResolved += result.conflictsResolved;
    total.conflictsDeferred += result.conflictsDeferred;
    total.hasMore = result.hasMore;
    total.persistedProgress ||= result.persistedProgress;
    total.historyInvalidated ||= result.historyInvalidated;
    total.failures.push(...result.failures);
  };

  for (let round = 0; round < MAX_FETCH_ALL_ROUNDS; round++) {
    let result: PullResult;
    try {
      result = await pullBatchOnce(vm, options.limit, options.conflictResolver);
    } catch (error) {
      // 前几轮已经落库且水位线已推进，裸抛原始错误会让调用方以为什么都没发生。
      // 把已完成部分的统计连同原始错误一起交出去；本轮内部的部分进度由
      // pullBatchOnce 自己包成 RxDBPartialSyncError 带上来。
      throw toPartialSyncError(error, total);
    }
    accumulate(result);

    if (!result.hasMore) break;
    // 一轮报了 hasMore 却一条都没拉到，说明水位线没推进，再循环也是同一批：
    // 就此收手并如实保留 hasMore，避免空转到轮数上限
    if (result.pulled === 0) break;
  }

  return total;
}

/**
 * 判定「没有任何持久化进度」。
 *
 * 直接读 `persistedProgress` —— 计数不足以判定：`applied === 0` 的轮次也可能已经
 * 回填了 `remoteId`、推进了水位线；`pulled > 0` 又可能是取回来但一条没写成。
 */
const isEmptyProgress = (result: PullResult): boolean => !result.persistedProgress;

/**
 * 把中断错误包装成带部分结果的错误。
 *
 * 已有进度才包装 —— 一条都没应用时包装只会让调用方多剥一层，原始错误更有用。
 *
 * 这里不解嵌套的 `RxDBPartialSyncError`：`pullBatchOnce` 把整批的应用与水位线推进
 * 放在**同一个**事务里，抛出即回滚，本轮不可能留下部分进度，也就没有内层进度可并。
 * （曾经有一段「合并内层结果」的分支，靠 `error.result as PullResult` 强转——
 * 本仓任何路径都到不了，真来了外部形状反而算出 NaN，已删。）
 */
function toPartialSyncError(error: unknown, accumulated: PullResult): unknown {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return isEmptyProgress(accumulated) ? normalized : new RxDBPartialSyncError<PullResult>(accumulated, normalized);
}

/**
 * 批量拉取所有实体的变更（单次 HTTP 请求）
 */
async function pullBatchOnce(
  vm: VersionManager,
  limitOption?: number,
  conflictResolverOption?: ConflictResolver
): Promise<PullResult> {
  const rxdb = vm.rxdb;
  const limit = limitOption ?? 1000;

  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();
  const { adapter: localAdapter } = await vm.getLocalRepositories();
  const branch = await vm.getCurrentBranch();
  const branchId = branch.id;

  // 获取祖先分支列表（包含自身）
  const branchIds = await getAncestorBranchIds(vm, branchId);

  // 1. 收集所有可同步实体的水位线
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);
  const allRepos: RepoSyncInfo[] = [];

  for (const EntityClass of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityClass);
    const syncType = getSyncType(metadata, rxdb.config.sync);

    // 跳过口径从内联的 `none | local` 换成能力矩阵，与单仓/级联路径同源
    if (!getSyncCapability(syncType).pull) continue;

    // filter 同步类型需要逐仓库处理，不参与批量
    if (syncType === 'filter') continue;

    const repoSync = await getOrCreateSyncRecord(
      repoSyncRepo,
      {
        namespace: metadata.namespace,
        entity: metadata.name,
        branchId,
        syncType
      },
      () => rxdb.entityManager.instantiate(RxDBSync)
    );

    // 批量是枚举路径 —— 被关掉的仓库跳过而不是让整批失败
    if (!isRepositorySyncEnabled(repoSync)) continue;

    allRepos.push({
      namespace: metadata.namespace,
      entity: metadata.name,
      syncId: repoSync.id,
      repoSync,
      lastPullRemoteChangeId: repoSync.lastPullRemoteChangeId ?? 0,
      syncType
    });
  }

  if (allRepos.length === 0) {
    return {
      pulled: 0,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: false,
      historyInvalidated: false,
      failures: []
    };
  }

  // 2. 构建依赖图获取拓扑排序（父→子）
  const entityMetadatas = rxdb.config.entities.map(e => getEntityMetadata(e));
  const graph = buildDependencyGraph(entityMetadatas);
  const sortedRepos = topologicalSortForPull(graph);

  // 按拓扑顺序排列 allRepos
  const repoMap = new Map(allRepos.map(r => [`${r.namespace}:${r.entity}`, r]));
  const orderedRepos = sortedRepos
    .map(sr => repoMap.get(`${sr.namespace}:${sr.entity}`))
    .filter((r): r is RepoSyncInfo => r != null);

  // 3. 单次请求获取所有变更
  const totalLimit = limit * orderedRepos.length;
  let allRemoteChanges: RemoteChange[];

  const batchRequests: PullBatchRequest[] = orderedRepos.map(r => ({
    namespace: r.namespace,
    entity: r.entity,
    sinceId: r.lastPullRemoteChangeId
  }));

  if (remoteAdapter.pullChangesBatch) {
    allRemoteChanges = await remoteAdapter.pullChangesBatch(batchRequests, totalLimit, branchIds);
  } else {
    // 降级方案：逐实体拉取，避免 MIN(sinceId) 导致水位线差异时的巨量冗余数据。
    // 「逐祖先分支拉 + 按仓库全局排序后截断」的口径与单仓路径共用同一份实现，
    // 见 pullAncestorBranchChanges 的 @remarks
    const perRepo = await Promise.all(
      orderedRepos.map(repo =>
        pullAncestorBranchChanges(
          remoteAdapter,
          { namespace: repo.namespace, entity: repo.entity, sinceId: repo.lastPullRemoteChangeId, limit },
          branchIds
        )
      )
    );
    allRemoteChanges = perRepo.flat();
  }

  // 4. 按实体分组
  const changesByEntity = new Map<string, RemoteChange[]>();
  for (const change of allRemoteChanges) {
    const key = `${change.namespace}:${change.entity}`;
    if (!changesByEntity.has(key)) changesByEntity.set(key, []);
    changesByEntity.get(key)!.push(change);
  }

  // 5. 按拓扑顺序处理每个实体的变更
  let totalPulled = 0;
  let totalCompacted = 0;
  let totalApplied = 0;
  let totalConflictsResolved = 0;
  // 恒 0：MERGE / DEFER 在 resolveConflictsAndBuildActions 里整轮抛错回滚，
  // 走不到累加路径（见 conflict.ts 对运行时可应用范围的说明）。
  // 保留这个字段是为了与 pullWithBulkSync 路径的返回结构对齐。
  const totalConflictsDeferred = 0;
  let hasMore = false;
  const clientId = rxdb.context.clientId;
  // 调用方给了就用调用方的：此前这里写死 LWW，同一个自定义策略走 pullRepository 生效、
  // 走 pull() 默认的批量路径静默失效，两条路径对同一份冲突给出不同结果。
  const conflictResolver = conflictResolverOption === undefined ? new LWWConflictResolver() : conflictResolverOption;

  // 整批仓库的应用与水位线推进必须在**一个**事务里。
  //
  // 否则第 k 个仓库失败时，前 k-1 个的数据已落库、`RxDBSync` 水位线也已前移：
  // 重试会从新水位线继续，中间那段变更既不重放也不告警，静默消失。
  // 事务内的读写一律经 executor —— 持有它才算在本事务内（C2）。
  //
  // 注意：远端拉取（pullChangesBatch / pullChanges）在事务之前就已完成，
  // 事务里只有本地工作，不会把网络往返圈进事务窗口。
  await localAdapter.transaction(async executor => {
    // 仓库必须在事务体**内**经 executor 获取。事务外取到的句柄绑定在适配器上，
    // 其读写会重新排队并排在自己这个事务后面（队列并发度 1）—— 翻转后即永久挂起。
    const changeRepo = executor.getRepository(RxDBChange);
    const txRepoSyncRepo = executor.getRepository(RxDBSync);

    for (const repo of orderedRepos) {
      const entityChanges = changesByEntity.get(`${repo.namespace}:${repo.entity}`) ?? [];

      // 过滤已处理的变更（按实体水位线过滤）
      const filteredChanges = entityChanges.filter(c => c.id > repo.lastPullRemoteChangeId);

      if (filteredChanges.length === 0) continue;

      totalPulled += filteredChanges.length;

      // 分离自己推送的变更和他人的变更
      // 只按 clientId 识别：远端记录缺少 localId（如 push 走 actions-only 路径）时，
      // 自己的变更也不能进入他人变更的 apply/conflict 链路
      const ownChanges: RemoteChange[] = [];
      const otherChanges: RemoteChange[] = [];

      for (const rc of filteredChanges) {
        if (rc.clientId != null && rc.clientId === clientId) {
          ownChanges.push(rc);
        } else {
          otherChanges.push(rc);
        }
      }

      // 批量更新自己推送变更的 remoteId（只有带 localId 的记录才能回填映射）
      const mappableChanges = ownChanges.filter(c => c.localId != null);
      if (mappableChanges.length > 0) {
        const localIds = mappableChanges.map(c => c.localId!);
        const locals = await changeRepo.find({
          where: {
            combinator: 'and',
            rules: [
              { field: 'id', operator: 'in', value: localIds },
              { field: 'remoteId', operator: '=', value: null }
            ]
          }
        });

        if (locals.length > 0) {
          const ownChangeMap = new Map(mappableChanges.map(c => [c.localId!, c.id]));
          for (const local of locals) {
            const remoteId = ownChangeMap.get(local.id);
            if (remoteId != null) {
              await changeRepo.update(local, { remoteId });
            }
          }
        }
      }

      // 压缩并应用他人的变更
      if (otherChanges.length > 0) {
        const localActions = createEmptyActions();
        compactChanges(otherChanges, localActions);

        const effectiveCount = countActions(localActions);
        totalCompacted += otherChanges.length - effectiveCount;

        const actionEntries = createConflictActionEntries(otherChanges, localActions);
        const pendingLocalChanges = await queryPendingLocalChanges(
          changeRepo,
          repo.namespace,
          repo.entity,
          branchId,
          repo.repoSync.lastPushedChangeId ?? null,
          [...new Set(actionEntries.map(entry => entry.entityId))]
        );

        const { applyActions, conflictsResolved } = await resolveConflictsAndBuildActions(
          actionEntries,
          pendingLocalChanges,
          {
            changeRepo,
            conflictResolver,
            dispatchEvent: (event: RxDBEvent) => rxdb.dispatchEvent(event),
            repoLabel: `${repo.namespace}:${repo.entity}`,
            localClientId: rxdb.context.clientId
          }
        );
        totalConflictsResolved += conflictsResolved;

        const applyCount = countActions(applyActions);
        if (applyCount > 0) {
          // disableTriggers=true 确保不生成本地 RxDBChange 记录
          await executor.mergeChanges(applyActions, undefined, true);
          totalApplied += applyCount;
        }
      }

      // 更新水位线（reduce 求最大值，避免 Math.max(...arr) 在超大数组上栈溢出）
      const maxRemoteId = filteredChanges.reduce((max, c) => (c.id > max ? c.id : max), filteredChanges[0].id);
      repo.repoSync = await txRepoSyncRepo.update(repo.repoSync, {
        lastPullRemoteChangeId: maxRemoteId,
        lastPulledAt: new Date(),
        updatedAt: new Date()
      });

      // 判断该实体是否还有更多数据：使用每个实体的 limit 而非全量
      if (filteredChanges.length >= limit) hasMore = true;
    }
  });

  return {
    pulled: totalPulled,
    compacted: totalCompacted,
    applied: totalApplied,
    hasMore,
    conflictsResolved: totalConflictsResolved,
    conflictsDeferred: totalConflictsDeferred,
    // 整批在同一个事务里：只要拉到过变更，水位线（以及 remoteId 回填）就已随事务提交，
    // 因此 `totalPulled > 0` 等价于「已有写入落库」，与 applied 是否为 0 无关。
    persistedProgress: totalPulled > 0,
    // 只有真正 merge 进实体表才会让 undo 历史边界失效；全被压缩抵消的批次不算。
    historyInvalidated: totalApplied > 0,
    failures: []
  };
}
