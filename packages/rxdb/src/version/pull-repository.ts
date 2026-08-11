/**
 * @fileoverview 仓库级别的拉取（pull）操作
 *
 * 在仓库（实体类型）级别提供细粒度的拉取控制，
 * 支持通过依赖图分析的级联同步。
 */

import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import type { RuleGroup } from '../repository/query.interface.js';
import type { RxDBEvent } from '../rxdb-events.js';
import { RepositorySyncBeginEvent, RepositorySyncCompleteEvent, RepositorySyncErrorEvent } from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import { RemoteChange } from '../system/system.interface.js';
import { LWWConflictResolver } from './LWWConflictResolver.js';
import type {
  PullRepositoryOptions,
  PullRepositoryResult,
  RepositoryIdentifier,
  SyncFailure
} from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';
import { findBlockingDependency, repositoryKey, RxDBDependencyFailedError } from './cascade-contract.js';
import { compactChanges } from './compact-changes.js';
import { buildDependencyGraph, type DependencyGraph } from './dependency-graph.js';
import {
  countActions,
  createConflictActionEntries,
  createEmptyActions,
  markLocalChangesSuperseded,
  queryPendingLocalChanges,
  resolveConflictsAndBuildActions
} from './pull-conflict-utils.js';
import { getOrCreateSyncRecord, resolvePullIneligibility } from './sync-record-utils.js';
import { getSyncType, type RepositorySyncType } from './sync-type-utils.js';
import { topologicalSortForPull } from './topological-sort.js';

/**
 * 验证 RuleGroup 结构是否有效
 */
function isValidRuleGroup(rg: unknown): rg is RuleGroup {
  if (!rg || typeof rg !== 'object') return false;
  const obj = rg as Record<string, unknown>;
  return (obj['combinator'] === 'and' || obj['combinator'] === 'or') && Array.isArray(obj['rules']);
}

// 类型单一来源在 VersionManager.interface.ts（对外导出的那一份）；
// 这里只做转发，避免两份定义各自漂移。
export type { PullRepositoryOptions, PullRepositoryResult };

/**
 * 仓库级「零进度」基线：跳过或失败前一条都没落库时用它填充计数字段
 *
 * 用函数而非共享常量：`failures` 是可变数组，共享同一份引用会让不同仓库的
 * 结果互相串改。
 */
function emptyRepositoryProgress(): Omit<PullRepositoryResult, 'repository'> {
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

/**
 * 从中断错误里取出仓库级的部分进度。
 *
 * 结构化校验而非直接断言类型：`RxDBPartialSyncError` 的 `result` 是泛型，
 * 拿一个 `as PullRepositoryResult` 硬转会在别处抛出别的形状时静默出错。
 *
 * @internal
 */
export function partialRepositoryProgressOf(error: Error): PullRepositoryResult | undefined {
  if (!(error instanceof RxDBPartialSyncError)) return undefined;
  const result: unknown = error.result;
  if (!result || typeof result !== 'object') return undefined;
  const candidate = result as Partial<PullRepositoryResult>;
  return typeof candidate.applied === 'number' && typeof candidate.persistedProgress === 'boolean' ?
      (candidate as PullRepositoryResult)
    : undefined;
}

/**
 * 默认拉取仓库选项
 */
const DEFAULT_PULL_REPOSITORY_OPTIONS: Required<Omit<PullRepositoryOptions, 'filter' | 'conflictResolver'>> &
  Pick<PullRepositoryOptions, 'filter' | 'conflictResolver'> = {
  limit: 1000,
  fetchAll: false,
  includeRelated: true,
  filter: undefined,
  conflictResolver: undefined
};

/**
 * 为单个仓库拉取变更
 *
 * @param vm - VersionManager 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @param options - 拉取选项
 * @returns 拉取结果
 *
 * @example
 * ```ts
 * // 在不进行级联的情况下拉取 Todo 仓库
 * const result = await pullRepository(vm, 'public', 'Todo', {
 *   includeRelated: false
 * });
 *
 * // 拉取 Todo 及其所有依赖项（如 User）
 * const result = await pullRepository(vm, 'public', 'Todo', {
 *   includeRelated: true
 * });
 * ```
 */
export async function pullRepository(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: PullRepositoryOptions
): Promise<PullRepositoryResult> {
  const opts = { ...DEFAULT_PULL_REPOSITORY_OPTIONS, ...options };
  const rxdb = vm.rxdb;

  // 触发开始事件
  rxdb.dispatchEvent(new RepositorySyncBeginEvent('pull', namespace, entity, opts.includeRelated));

  try {
    const result = await _pullRepositoryImpl(vm, namespace, entity, opts);

    // 触发完成事件
    rxdb.dispatchEvent(
      new RepositorySyncCompleteEvent('pull', namespace, entity, {
        pulled: result.pulled,
        compacted: result.compacted,
        conflictsResolved: result.conflictsResolved,
        conflictsDeferred: result.conflictsDeferred
      })
    );

    return result;
  } catch (error) {
    // 触发错误事件
    rxdb.dispatchEvent(new RepositorySyncErrorEvent('pull', namespace, entity, error as Error));
    throw error;
  }
}

/**
 * pullRepository 的内部实现
 */
async function _pullRepositoryImpl(
  vm: VersionManager,
  namespace: string,
  entity: string,
  opts: typeof DEFAULT_PULL_REPOSITORY_OPTIONS
): Promise<PullRepositoryResult> {
  // 验证仓库是否存在
  const EntityType = vm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });

  if (!EntityType) {
    throw new RxDBError(`Entity not found: ${namespace}:${entity}`);
  }

  const metadata = getEntityMetadata(EntityType);

  // 检查同步类型（支持全局配置回退）。资格判定与级联路径共用 `resolvePullIneligibility`，
  // 避免两条路径各写一份而漂移。
  // 同一处叠加 `RxDBSync.enabled` —— 显式点名单个仓库时抛错而非静默跳过，
  // 与 syncType 不合格时的行为一致；批量枚举路径（pullBatch）才是跳过。
  const syncType = getSyncType(metadata, vm.rxdb.config.sync);
  const ineligible = await resolvePullIneligibility(vm, namespace, entity, syncType);

  if (ineligible) {
    throw new RxDBError(`Cannot pull repository ${namespace}:${entity}: ${ineligible}.`);
  }

  // 对于 Filter 同步类型，从配置中提取 filter 函数并执行
  let effectiveFilter = opts.filter;
  if (syncType === 'filter' && !effectiveFilter) {
    const syncConfig = metadata.sync as { type: string; remote?: { filter?: () => RuleGroup } };
    if (syncConfig?.remote?.filter) {
      // T022: filter 函数执行错误处理
      try {
        effectiveFilter = syncConfig.remote.filter();
      } catch (error) {
        throw new RxDBError(
          `Filter function failed for ${namespace}:${entity}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // T023: RuleGroup 验证逻辑
      if (effectiveFilter && !isValidRuleGroup(effectiveFilter)) {
        throw new RxDBError(
          `Invalid RuleGroup returned by filter function for ${namespace}:${entity}: ` +
            `RuleGroup must have 'combinator' ('and' | 'or') and 'rules' array properties.`
        );
      }
    }
  }

  // 创建带有 filter 的选项
  const optsWithFilter = { ...opts, filter: effectiveFilter };

  // 处理级联拉取
  if (opts.includeRelated) {
    return await pullWithCascade(vm, namespace, entity, optsWithFilter);
  }

  // 单仓库拉取（传递 filter）
  return await pullSingleRepository(vm, namespace, entity, optsWithFilter);
}

/**
 * 级联拉取（包含依赖）
 *
 * @internal
 */
async function pullWithCascade(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options: typeof DEFAULT_PULL_REPOSITORY_OPTIONS
): Promise<PullRepositoryResult> {
  // 构建依赖图
  const entities = vm.rxdb.config.entities.map(e => getEntityMetadata(e));
  const graph = buildDependencyGraph(entities);

  // 预构建 entityMap 避免循环内重复查找
  const entityMap = new Map<string, (typeof vm.rxdb.config.entities)[number]>(
    vm.rxdb.config.entities.map(e => {
      const m = getEntityMetadata(e);
      return [`${m.namespace}:${m.name}`, e];
    })
  );

  // 获取拓扑排序（顺序：父 -> 子）
  const sortedRepos = topologicalSortForPull(graph);

  // 查找目标仓库及其依赖项
  const targetKey = `${namespace}:${entity}`;
  const dep = graph.get(targetKey);

  if (!dep) {
    throw new RxDBError(`Repository ${namespace}:${entity} not found in dependency graph`);
  }

  // 收集所有需要拉取的仓库（目标 + 其依赖）
  const reposToPull = new Set<string>([targetKey]);
  const collectDependencies = (key: string): void => {
    const d = graph.get(key);
    if (!d) return;

    for (const parent of d.dependsOn) {
      const parentKey = `${parent.namespace}:${parent.entity}`;
      if (!reposToPull.has(parentKey)) {
        reposToPull.add(parentKey);
        collectDependencies(parentKey);
      }
    }
  };

  collectDependencies(targetKey);

  // 过滤排序列表，只包含需要拉取的仓库
  const orderedRepos = sortedRepos.filter(repo => {
    const key = `${repo.namespace}:${repo.entity}`;
    return reposToPull.has(key);
  });

  // 按顺序拉取仓库并处理错误
  const results: PullRepositoryResult[] = [];
  const failures: SyncFailure[] = [];
  const failedRepos = new Map<string, Error>();

  for (const repo of orderedRepos) {
    const result = await pullCascadeNode(vm, graph, entityMap, repo, options, failedRepos);
    results.push(result);

    // 按策略跳过（`skipped` 且 `success`）不算失败：既不进失败清单，也不阻断下游
    if (result.error) {
      failedRepos.set(repositoryKey(repo), result.error);
      failures.push({ repository: repo, error: result.error });
    }
  }

  // 返回目标仓库结果，并附带相关仓库的结果
  const targetResult = results.find(r => r.repository.namespace === namespace && r.repository.entity === entity);
  if (!targetResult) {
    throw new RxDBError(`Internal error: target repository result not found`);
  }

  targetResult.relatedResults = results.filter(r => r !== targetResult);
  // 目标仓的 `failures` 是整次级联的聚合（含目标仓自身）；
  // `relatedResults` 里每一项的 `failures` 只覆盖它自己那一次子调用
  targetResult.failures = failures;

  // 级联里依赖仓的落库与实体改写同样是本次 pull 的成果。
  // 目标仓自己 applied=0 不代表整次调用没写过东西 —— 两个信号必须跨全部仓库取并集，
  // 否则调用方（VersionManager）会漏清 undo 历史、或误判「什么都没发生」。
  for (const related of targetResult.relatedResults) {
    targetResult.persistedProgress ||= related.persistedProgress;
    targetResult.historyInvalidated ||= related.historyInvalidated;
  }

  // 目标仓没同步成功就必须 reject —— 此前依赖失败时只把目标仓包成
  // `skipped: 'Dependency failed'` 然后 **resolve**，调用方拿到的是一个成功的
  // Promise，而目标仓一条都没拉。
  //
  // 根因取失败清单里的第一条（最上游那个真错误），而不是目标仓身上那层
  // 「被依赖阻断」的合成错误。只有「一条失败且没有任何落库」时才裸抛：
  // 其余情况必须连同聚合结果（含 relatedResults 与 failures）一起交出去，
  // 否则依赖仓已提交的那部分会随着裸抛一起消失。
  const [rootFailure] = failures;
  if (!targetResult.success && rootFailure) {
    if (!targetResult.persistedProgress && failures.length === 1) throw rootFailure.error;
    throw new RxDBPartialSyncError<PullRepositoryResult>(targetResult, rootFailure.error);
  }

  return targetResult;
}

/**
 * 级联拉取中的单个节点：先过依赖闸门，再过同步资格闸门，最后才真正拉取
 *
 * @internal
 */
async function pullCascadeNode(
  vm: VersionManager,
  graph: DependencyGraph,
  entityMap: ReadonlyMap<string, EntityType>,
  repo: RepositoryIdentifier,
  options: typeof DEFAULT_PULL_REPOSITORY_OPTIONS,
  failedRepos: ReadonlyMap<string, Error>
): Promise<PullRepositoryResult> {
  const repoKey = repositoryKey(repo);

  const blocked = findBlockingDependency(graph, repoKey, failedRepos);
  if (blocked) {
    return {
      ...emptyRepositoryProgress(),
      repository: repo,
      success: false,
      skipped: `dependency ${repositoryKey(blocked.dependency)} failed`,
      error: new RxDBDependencyFailedError(repo, blocked.dependency, blocked.cause)
    };
  }

  const EntityType = entityMap.get(repoKey);
  // entityMap 与依赖图都由 `config.entities` 构建，节点必然能反查回实体类
  if (!EntityType) {
    throw new RxDBError(`Internal error: entity not found for cascade node ${repoKey}`);
  }

  const repoMetadata = getEntityMetadata(EntityType);
  const repoSyncType = getSyncType(repoMetadata, vm.rxdb.config.sync);

  // 级联节点必须走和单仓路径同一份资格校验，否则 `local` / `none`
  // 的依赖仓会被拿去问远端要数据，绕过它自己声明的同步策略
  // 关联仓被单独关掉时同样跳过 —— 级联不是绕开开关的后门
  const ineligible = await resolvePullIneligibility(vm, repo.namespace, repo.entity, repoSyncType);
  if (ineligible) {
    return { ...emptyRepositoryProgress(), repository: repo, success: true, skipped: ineligible };
  }

  try {
    const result = await pullSingleRepository(vm, repo.namespace, repo.entity, {
      ...options,
      // T039: 为每个实体独立提取 filter
      filter: resolveCascadeFilter(repoKey, repoMetadata, repoSyncType, options.filter),
      includeRelated: false // 防止递归级联
    });
    result.success = true;
    return result;
  } catch (error) {
    // 失败的仓库可能已经提交了前几轮（`RxDBPartialSyncError` 带着这段进度），
    // 写死 0 会把已落库的进度抹掉，也把根因藏进「错误里套错误」。
    const normalized = error instanceof Error ? error : new Error(String(error));
    const cause = normalized instanceof RxDBPartialSyncError ? normalized.cause : normalized;
    return {
      ...(partialRepositoryProgressOf(normalized) ?? emptyRepositoryProgress()),
      repository: repo,
      success: false,
      error: cause,
      failures: [{ repository: repo, error: cause }]
    };
  }
}

/**
 * 解析级联节点自己的 filter
 *
 * @param repoKey - 仓库键（`namespace:entity`），用于错误消息
 * @param repoMetadata - 该仓库的实体元数据
 * @param repoSyncType - 该仓库的有效同步类型
 * @param inheritedFilter - 调用方显式传入的 filter
 * @returns 该仓库实际生效的 filter
 * @throws {RxDBError} filter 函数抛错或返回非法 RuleGroup 时
 *
 * @remarks
 * fail-closed：filter 表达的是租户/用户数据边界，抛错或返回非法值一律终止本次同步。
 * 此前这里只 console.warn 再把 filter 置为 undefined —— 后续请求会拉取**全部**远端行，
 * 把一个配置错误变成过量数据落地。与单仓路径保持同一口径。
 *
 * @internal
 */
function resolveCascadeFilter(
  repoKey: string,
  repoMetadata: EntityMetadata,
  repoSyncType: RepositorySyncType,
  inheritedFilter: RuleGroup | undefined
): RuleGroup | undefined {
  // T040: Full 同步类型不使用 filter（防止父实体 filter 传播）
  if (repoSyncType === 'full') return undefined;
  if (repoSyncType !== 'filter') return inheritedFilter;

  const syncConfig = repoMetadata.sync as { type: string; remote?: { filter?: () => RuleGroup } };
  const filterFn = syncConfig?.remote?.filter;
  if (!filterFn) return inheritedFilter;

  let extractedFilter: RuleGroup;
  try {
    extractedFilter = filterFn();
  } catch (error) {
    throw new RxDBError(
      `Filter function failed for ${repoKey}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!isValidRuleGroup(extractedFilter)) {
    throw new RxDBError(
      `Invalid RuleGroup returned by filter function for ${repoKey}: ` +
        `RuleGroup must have 'combinator' ('and' | 'or') and 'rules' array properties.`
    );
  }

  return extractedFilter;
}

/**
 * 单仓库拉取（无级联）
 *
 * @internal
 */
async function pullSingleRepository(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options: typeof DEFAULT_PULL_REPOSITORY_OPTIONS
): Promise<PullRepositoryResult> {
  const rxdb = vm.rxdb;

  // 验证远端适配器
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();
  const { adapter: localAdapter } = await vm.getLocalRepositories();

  // 获取当前分支
  const branch = await vm.getCurrentBranch();

  // 获取或创建 RxDBSync 记录
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);

  const EntityType = vm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });
  const metadata = getEntityMetadata(EntityType!);
  const syncType = getSyncType(metadata, vm.rxdb.config.sync);

  let repoSync = await getOrCreateSyncRecord(
    repoSyncRepo,
    {
      namespace,
      entity,
      branchId: branch.id,
      syncType
    },
    () => rxdb.entityManager.instantiate(RxDBSync)
  );

  const lastPullRemoteChangeId: number | null = repoSync.lastPullRemoteChangeId;

  // 汇总结果
  let totalPulled = 0;
  let totalCompacted = 0;
  let totalApplied = 0;
  let totalConflictsResolved = 0;
  const totalConflictsDeferred = 0;
  // 每提交一个轮次事务就置位：该轮的 remoteId 回填与水位线推进已经落库，
  // 后续轮次失败时重试必须从新水位线继续，不能对外报「什么都没发生」。
  let persistedProgress = false;
  let hasMore: boolean;
  let lastRemoteChange: RemoteChange | undefined;
  const conflictResolver = options.conflictResolver ?? new LWWConflictResolver();

  // 使用最新值确定起始 ID
  let sinceId = lastPullRemoteChangeId ?? 0;

  let localActions = createEmptyActions();

  try {
    do {
      // 按仓库和分支过滤拉取变更（支持 filter 条件）
      // 单仓拉取此前只传裸实体名，同名实体跨 namespace 存在时会解析歧义
      const remoteChanges = await remoteAdapter.pullChanges(
        sinceId,
        options.limit,
        [`${namespace}:${entity}`],
        options.filter,
        branch.id
      );

      totalPulled += remoteChanges.length;
      hasMore = remoteChanges.length >= options.limit;
      if (remoteChanges.length === 0) {
        // 即使没有拉取到变更，也要更新 lastPulledAt 时间戳
        // 这样可以正确记录同步尝试的时间
        await repoSyncRepo.update(repoSync, {
          lastPulledAt: new Date(),
          updatedAt: new Date()
        });
        break;
      }

      // 记录最后一个远端变更
      lastRemoteChange = remoteChanges[remoteChanges.length - 1];
      sinceId = lastRemoteChange.id;

      // 分离自己 push 上去的变更和他人的变更
      const clientId = rxdb.context.clientId;
      const ownChanges: RemoteChange[] = [];
      const otherChanges: RemoteChange[] = [];

      // 只按 clientId 识别：远端记录缺少 localId（如 push 走 actions-only 路径）时，
      // 自己的变更也不能进入他人变更的 apply/conflict 链路
      for (const rc of remoteChanges) {
        if (rc.clientId != null && rc.clientId === clientId) {
          ownChanges.push(rc);
        } else {
          otherChanges.push(rc);
        }
      }

      // remoteId 回填、实体应用、supersession 标记与水位线推进必须在**一个**事务里。
      //
      // 否则中途失败时前面几步已落库、水位线也可能已前移：重试会从新水位线继续，
      // 中间那段既不重放也不告警，静默消失（对齐 pull-batch.ts 的既有事务化处理）。
      //
      // 注意：远端拉取（上面的 remoteAdapter.pullChanges）在事务之前就已完成，
      // 事务里只有本地写入，不会把网络往返圈进事务窗口。
      let roundApplied = 0;
      await localAdapter.transaction(async executor => {
        // 仓库必须在事务体**内**经 executor 获取：事务外的 `changeRepo` / `repoSyncRepo`
        // 绑定在适配器上，其读写会重新排队并排在自己这个事务后面（队列并发度 1）。
        const txChangeRepo = executor.getRepository(RxDBChange);
        const txRepoSyncRepo = executor.getRepository(RxDBSync);
        // 为自己 push 的变更更新本地 remoteId（只有带 localId 的记录才能回填映射）
        const mappableChanges = ownChanges.filter(c => c.localId != null);
        if (mappableChanges.length > 0) {
          const localIds = mappableChanges.map(c => c.localId!);
          const locals = await txChangeRepo.find({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: 'in', value: localIds }]
            }
          });
          const localMap = new Map(locals.map(l => [l.id, l]));
          for (const ownChange of mappableChanges) {
            const local = localMap.get(ownChange.localId!);
            if (local && local.remoteId == null) {
              await txChangeRepo.update(local, { remoteId: ownChange.id });
            }
          }
        }

        // 只对他人的变更执行压缩和应用
        if (otherChanges.length > 0) {
          compactChanges(otherChanges, localActions);

          const effectiveCount = countActions(localActions);
          totalCompacted += otherChanges.length - effectiveCount;

          const actionEntries = createConflictActionEntries(otherChanges, localActions);
          const pendingLocalChanges = await queryPendingLocalChanges(
            txChangeRepo,
            namespace,
            entity,
            branch.id,
            repoSync.lastPushedChangeId,
            [...new Set(actionEntries.map(entry => entry.entityId))]
          );

          const { applyActions, conflictsResolved, localChangeSupersessions } = await resolveConflictsAndBuildActions(
            actionEntries,
            pendingLocalChanges,
            {
              changeRepo: txChangeRepo,
              conflictResolver,
              dispatchEvent: (event: RxDBEvent) => rxdb.dispatchEvent(event),
              repoLabel: `${namespace}:${entity}`,
              deferLocalChangeSupersession: true,
              localClientId: rxdb.context.clientId
            }
          );
          totalConflictsResolved += conflictsResolved;

          const applyCount = countActions(applyActions);
          if (applyCount > 0) {
            // 先将实体变更应用到本地数据库（在更新 RxDBSync 之前）
            // disableTriggers=true 确保不生成本地 RxDBChange 记录
            await executor.mergeChanges(applyActions, undefined, true);
            for (const supersession of localChangeSupersessions) {
              await markLocalChangesSuperseded(txChangeRepo, supersession.localChanges, supersession.remoteId);
            }
            roundApplied = applyCount;
          }

          // 清除操作以便下一次迭代使用
          localActions = createEmptyActions();
        }

        // 使用直接 SQL 更新 RxDBSync（避免实体缓存问题）
        const lastChangeId = lastRemoteChange!.id;
        repoSync = await txRepoSyncRepo.update(repoSync, {
          lastPullRemoteChangeId: lastChangeId,
          lastPulledAt: new Date(),
          updatedAt: new Date()
        });
      });
      persistedProgress = true;
      totalApplied += roundApplied;
    } while (hasMore && options.fetchAll);
  } catch (error) {
    // 跨多轮 fetchAll 时，前面几轮的事务已经真实提交；直接裸抛会让调用方
    // 以为「什么都没发生」。一条都没落库时包装只会多剥一层，原始错误更有用
    // （对齐 pull-batch.ts 的 isEmptyProgress/toPartialSyncError 约定）。
    if (!persistedProgress) throw error;
    throw new RxDBPartialSyncError<PullRepositoryResult>(
      {
        repository: { namespace, entity },
        pulled: totalPulled,
        compacted: totalCompacted,
        applied: totalApplied,
        hasMore: true,
        conflictsResolved: totalConflictsResolved,
        conflictsDeferred: totalConflictsDeferred,
        persistedProgress: true,
        historyInvalidated: totalApplied > 0,
        failures: [
          { repository: { namespace, entity }, error: error instanceof Error ? error : new Error(String(error)) }
        ]
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }

  return {
    repository: { namespace, entity },
    pulled: totalPulled,
    compacted: totalCompacted,
    applied: totalApplied,
    hasMore,
    conflictsResolved: totalConflictsResolved,
    conflictsDeferred: totalConflictsDeferred,
    persistedProgress,
    historyInvalidated: totalApplied > 0,
    failures: []
  };
}
