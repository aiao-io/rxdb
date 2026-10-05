/**
 * @fileoverview 仓库级别的推送操作
 *
 * 在仓库（实体类型）级别提供细粒度的推送控制，
 * 支持通过依赖图分析的级联同步。
 */

import {
  assertSingleActiveBranch,
  compactChanges,
  declareTrustedWrite,
  type EntityType,
  getEntityMetadata,
  getOrCreateSyncRecord,
  getRxDBChangeEntityIdQueryValues,
  getRxDBChangeKey,
  getSyncType,
  IRepository,
  type PushRepositoryResult,
  type RemoteChangeRejection,
  type RemoteChangeResult,
  repositoryKey,
  RepositorySyncBeginEvent,
  RepositorySyncCompleteEvent,
  RepositorySyncErrorEvent,
  resolvePushIneligibility,
  type RxDBAdapterRemoteBase,
  RxDBChange,
  RxDBChangeRuleGroup,
  RxDBDependencyFailedError,
  RxDBError,
  RxDBPartialSyncError,
  RxDBSync,
  type SwitchVersionActions,
  type SwitchVersionChange,
  type SyncFailure,
  type SyncRejection,
  type TransactionExecutor,
  TrustedWriteIntent
} from '@aiao/rxdb';
import type { PushInFlightSession } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { getAncestorBranchIds } from './branch-utils.js';
import { findBlockingDependency } from './cascade-blocking.js';
import { buildDependencyGraph, type DependencyGraph, type RepositoryIdentifier } from './dependency-graph.js';
import type { SyncManager } from './SyncManager.js';
import { dependencyEdgeForAction, type SortActionKind, topologicalSortForAction } from './topological-sort.js';
/**
 * 推送仓库选项
 */
export interface PushRepositoryOptions {
  /**
   * 每批次推送的最大变更数量
   * @default 1000
   */
  batchSize?: number;

  /**
   * 是否包含相关实体（级联同步）
   *
   * 当为 true 时：
   * - 自动推送所有子实体（引用当前实体的实体）
   * - 遵循反向拓扑顺序：子 -> 父
   * - 示例：推送 User 时会自动推送 Post
   *
   * 当为 false 时：
   * - 仅同步指定仓库
   * - 可能会导致远端数据不完整
   *
   * @default true
   */
  includeRelated?: boolean;
}

// `PushRepositoryResult` 此前在本文件和 `VersionManager.interface.ts`
// 各有一份完全相同的定义，改一处漏一处。唯一定义收敛到对外导出的那一份，这里只做转发
// （与 `pull-repository.ts` 的 `PullRepositoryResult` 同一处理）。
export type { PushRepositoryResult };

/**
 * 默认推送仓库选项
 */
const DEFAULT_PUSH_REPOSITORY_OPTIONS: Required<PushRepositoryOptions> = {
  batchSize: 1000,
  includeRelated: true
};

function assertBatchSize(batchSize: number): void {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError('batchSize must be a positive safe integer');
  }
}

/**
 * 从异常里取出推送侧的部分进度。
 *
 * 与 `partialRepositoryProgressOf`（pull 侧）对称：按 `PushRepositoryResult` 独有的
 * `pushed` + `originalCount` 两个数值字段判形，`PullRepositoryResult` /
 * `SyncRepositoryResult` 都没有它们，不会误判。
 *
 * @param error - 任意异常
 * @returns 携带的推送结果；异常不是 `RxDBPartialSyncError` 或负载形状不符时返回 `undefined`
 */
export function partialPushProgressOf(error: Error): PushRepositoryResult | undefined {
  if (!(error instanceof RxDBPartialSyncError)) return undefined;
  const result: unknown = error.result;
  if (!result || typeof result !== 'object') return undefined;
  const candidate = result as Partial<PushRepositoryResult>;
  return typeof candidate.pushed === 'number' && typeof candidate.originalCount === 'number' ?
      (candidate as PushRepositoryResult)
    : undefined;
}

/**
 * 推送失败的唯一出口：一律抛，不 resolve 出 `success: false`。
 *
 * @remarks
 * 此前级联路径抛错、单仓路径 resolve 出 `success: false`，两种形状并存。
 * `bulkSync` 只看「有没有抛」来判定成败，于是单仓路径的失败被记成成功，
 * `BulkSyncResult.failed` 恒为 0 —— 推送失败在聚合层完全消失。
 *
 * 抛什么则按有没有真的发出去东西分：
 *
 * - `pushed === 0`：一条都没到远端，包一层只会让调用方多剥一层，直接抛原始错误
 *   （与 `pull.ts` / `pull-batch.ts` 的既有约定一致）；
 * - `pushed > 0`：这些条目已经落在远端且**不会**因为本次抛错而回滚，
 *   正是 {@link RxDBPartialSyncError} 的语义，进度挂在 `result` 上交出去。
 *
 * @param result - 失败的推送结果，`success` 必须为 `false`
 * @throws 恒抛
 * @internal
 */
function throwPushFailure(result: PushRepositoryResult): never {
  const { error } = result;
  // `success: false` 必然带 error（提交失败、远端失败、依赖阻断三条路径都会写）。
  // 真出现缺失只可能是内部状态坏了，不能静默当成功。
  if (!error) {
    throw new RxDBError(`Internal error: repository ${repositoryKey(result.repository)} failed without an error`);
  }

  if (result.pushed === 0) throw error;
  throw new RxDBPartialSyncError<PushRepositoryResult>(result, error);
}

/**
 * 为单个仓库推送变更
 *
 * @param sm - SyncManager 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @param options - 推送选项
 * @param rejectionSink - 被拒清单收集器。传入时本次调用只往里追加、不上报，由调用方在整次操作结束时
 *   统一上报（`push()` / `bulkSync` 一轮多仓）；不传时本次调用结束即自行上报。
 * @returns 推送结果
 *
 * @remarks
 * `reportRejections` 是整体替换语义：一轮操作里多次 `pushRepository` 各自上报会互相覆盖，
 * 只剩最后一个仓库的清单，所以上报边界必须由整次操作的发起者持有。
 * 无论成功、部分失败还是抛错，已落库的被拒都会交出去（追加进收集器或自行上报）。
 *
 * @example
 * ```ts
 * // 在不进行级联的情况下推送 Todo 仓库
 * const result = await pushRepository(sm, 'public', 'Todo', {
 *   includeRelated: false
 * });
 *
 * // 推送 Todo 以及所有依赖它的实体（如 Comment）
 * const result = await pushRepository(sm, 'public', 'Todo', {
 *   includeRelated: true
 * });
 * ```
 */
export async function pushRepository(
  sm: SyncManager,
  namespace: string,
  entity: string,
  options?: PushRepositoryOptions,
  rejectionSink?: SyncRejection[]
): Promise<PushRepositoryResult> {
  const opts: Required<PushRepositoryOptions> = {
    batchSize: options?.batchSize === undefined ? DEFAULT_PUSH_REPOSITORY_OPTIONS.batchSize : options.batchSize,
    includeRelated:
      options?.includeRelated === undefined ? DEFAULT_PUSH_REPOSITORY_OPTIONS.includeRelated : options.includeRelated
  };
  const rxdb = sm.rxdb;

  // 触发开始事件
  rxdb.dispatchEvent(new RepositorySyncBeginEvent('push', namespace, entity, opts.includeRelated));

  // 本轮 push 认领的「在飞」区间；undo 据此把还在往返途中的变更当成已推。
  // 从哪条路径提前返回都会经下面那个 finally，认领不会泄漏。
  const inFlight = sm.pushInFlight.session();
  // 本次调用已落库的被拒；先于完成/错误事件交出去，监听者看到事件时清单已是最新
  const rejections: SyncRejection[] = [];
  const settleRejections = (): void => {
    if (rejectionSink) rejectionSink.push(...rejections);
    else reportPushRejections(sm, rejections);
  };

  try {
    assertBatchSize(opts.batchSize);
    let result: PushRepositoryResult;
    try {
      result = await _pushRepositoryImpl(sm, namespace, entity, opts, inFlight, rejections);
    } finally {
      settleRejections();
    }

    // 触发完成事件
    rxdb.dispatchEvent(
      new RepositorySyncCompleteEvent('push', namespace, entity, {
        pushed: result.pushed,
        compacted: result.compacted,
        failed: result.failed
      })
    );

    return result;
  } catch (error) {
    // 触发错误事件
    rxdb.dispatchEvent(new RepositorySyncErrorEvent('push', namespace, entity, error as Error));
    throw error;
  } finally {
    inFlight.release();
  }
}

/**
 * pushRepository 的内部实现
 */
async function _pushRepositoryImpl(
  sm: SyncManager,
  namespace: string,
  entity: string,
  opts: Required<PushRepositoryOptions>,
  inFlight: PushInFlightSession,
  rejections: SyncRejection[]
): Promise<PushRepositoryResult> {
  // 验证仓库是否存在
  const EntityType = sm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });

  if (!EntityType) {
    throw new RxDBError(`Entity not found: ${namespace}:${entity}`);
  }

  const metadata = getEntityMetadata(EntityType);

  // 检查同步类型（支持全局配置回退）。资格判定与级联路径共用 `resolvePushIneligibility`，
  // 避免两条路径各写一份而漂移。
  // 同一处叠加 `RxDBSync.enabled`（此前推送路径从不读它）
  const ineligible = await resolvePushIneligibility(
    sm.rxdb,
    namespace,
    entity,
    getSyncType(metadata, sm.rxdb.entitySync)
  );

  if (ineligible) {
    throw new RxDBError(`Cannot push repository ${namespace}:${entity}: ${ineligible}.`);
  }

  // 处理级联推送
  if (opts.includeRelated) {
    return await pushWithCascade(sm, namespace, entity, opts, inFlight, rejections);
  }

  // 单仓库推送
  return await pushSingleRepository(sm, namespace, entity, opts, inFlight, rejections);
}

/**
 * 级联推送（包含依赖）
 *
 * @remarks
 * 这里**按相位**扫两遍仓库，而不是按单一拓扑序扫一遍。
 * 理由见 {@link topologicalSortForAction} —— INSERT 要父先、DELETE 要子先，
 * 一个顺序不可能同时满足。
 *
 * 每个仓库的「查变更 + 压缩」只做一次（{@link planRepositoryPush}），两个相位共用同一份
 * 计划；落库（写 `remoteId` + 推进水位线）也只做一次，在全部相位跑完后统一提交
 * （{@link commitPushPlans}）。否则 `originalCount` / `compacted` 会被算两遍，
 * 且第一个相位就把水位线推到最大 change id，第二个相位的变更会被整批吞掉。
 *
 * @internal
 */
async function pushWithCascade(
  sm: SyncManager,
  namespace: string,
  entity: string,
  options: Required<PushRepositoryOptions>,
  inFlight: PushInFlightSession,
  rejections: SyncRejection[]
): Promise<PushRepositoryResult> {
  // 构建依赖图
  const entities = sm.rxdb.config.entities.map(e => getEntityMetadata(e));
  const graph = buildDependencyGraph(entities);

  // 查找目标仓库及其依赖项
  const targetKey = `${namespace}:${entity}`;
  const dep = graph.get(targetKey);

  if (!dep) {
    throw new RxDBError(`Repository ${namespace}:${entity} not found in dependency graph`);
  }

  // 收集所有需要推送的仓库（目标 + 其依赖）
  const reposToPush = new Set<string>([targetKey]);
  const collectDependents = (key: string): void => {
    const d = graph.get(key);
    if (!d) return;

    for (const child of d.requiredBy) {
      const childKey = `${child.namespace}:${child.entity}`;
      if (!reposToPush.has(childKey)) {
        reposToPush.add(childKey);
        collectDependents(childKey);
      }
    }
  };

  collectDependents(targetKey);

  const orderRepos = (action: SortActionKind): RepositoryIdentifier[] =>
    topologicalSortForAction(graph, action).filter(repo => reposToPush.has(repositoryKey(repo)));

  const nodes = new Map<string, CascadeNode>();
  const failedRepos = new Map<string, Error>();

  for (const phase of PUSH_PHASES) {
    for (const repo of orderRepos(phase.action)) {
      await runCascadePhase(sm, graph, repo, phase, options, nodes, failedRepos, inFlight);
    }
  }

  // 相位全部跑完才落库：水位线必须一次推到位，中途推进会吞掉后一个相位的变更
  const insertOrder = orderRepos('INSERT').map(repo => {
    const node = nodes.get(repositoryKey(repo));
    // 每个相位都会遍历全部仓库，节点必然已建好
    if (!node) throw new RxDBError(`Internal error: cascade node missing for ${repositoryKey(repo)}`);
    return node;
  });
  // 未定案的仓库一起提交：被拒对齐的删除要子先父后、恢复要父先子后，逐仓各开一个事务做不到
  const committed = await commitPushPlans(
    sm,
    insertOrder.flatMap(node => (node.result ? [] : [node.plan!])),
    rejections
  );

  const results: PushRepositoryResult[] = [];
  const failures: SyncFailure[] = [];
  for (const node of insertOrder) {
    const repo = node.repo;
    const result = node.result ?? committed.get(node.plan!);
    if (!result) throw new RxDBError(`Internal error: push result missing for ${repositoryKey(repo)}`);
    results.push(result);

    // 按策略跳过（`skipped` 且 `success`）不算失败，不进失败清单
    if (result.error) {
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

  // 如果目标失败，则抛出。关联仓失败但目标仓推送成功时不抛：
  // 已经发到远端的变更不会因为抛错而回滚，调用方重试只会重复推送；
  // 失败清单通过 `failures` 交出去。
  if (!targetResult.success) throwPushFailure(targetResult);

  return targetResult;
}

/**
 * 级联推送中一个仓库的跨相位状态
 *
 * `result` 一旦落定就不再进入后续相位：可能是被闸门挡下（跳过 / 依赖失败）、
 * 无变更可推、或某个相位推失败了。否则 `plan` 一直留到所有相位跑完再统一提交。
 *
 * @internal
 */
interface CascadeNode {
  readonly repo: RepositoryIdentifier;
  plan?: RepositoryPushPlan;
  result?: PushRepositoryResult;
}

/**
 * 让一个仓库走完某一个相位：先过依赖闸门，再过同步资格闸门，然后只推本相位那几类动作
 *
 * @internal
 */
async function runCascadePhase(
  sm: SyncManager,
  graph: DependencyGraph,
  repo: RepositoryIdentifier,
  phase: PushPhase,
  options: Required<PushRepositoryOptions>,
  nodes: Map<string, CascadeNode>,
  failedRepos: Map<string, Error>,
  inFlight: PushInFlightSession
): Promise<void> {
  const repoKey = repositoryKey(repo);
  let node = nodes.get(repoKey);
  if (!node) {
    node = { repo };
    nodes.set(repoKey, node);
  }

  // 上一个相位已经定案（跳过 / 无变更 / 推失败），不再往下推
  if (node.result) return;

  // 阻断边随相位翻转：DELETE 相位子先父后（被 requiredBy 阻断），
  // INSERT 相位父先子后（被 dependsOn 阻断）。理由见 findBlockingDependency 的 @remarks。
  const blocked = findBlockingDependency(graph, repoKey, failedRepos, dependencyEdgeForAction(phase.action));
  if (blocked) {
    const error = new RxDBDependencyFailedError(repo, blocked.dependency, blocked.cause);
    node.result = {
      ...blockedPushProgress(node.plan),
      repository: repo,
      success: false,
      skipped: `dependency ${repositoryKey(blocked.dependency)} failed`,
      error
    };
    failedRepos.set(repoKey, error);
    return;
  }

  if (!node.plan) {
    // 级联节点必须走和单仓路径同一份资格校验，否则 `remote` / `local` / `none`
    // 的关联仓会被无差别推去远端
    const ineligible = await cascadeNodeIneligibility(sm, repo);
    if (ineligible) {
      node.result = { ...emptyPushProgress(), repository: repo, success: true, skipped: ineligible };
      return;
    }

    try {
      const planned = await planRepositoryPush(sm, repo.namespace, repo.entity, inFlight);
      if ('emptyResult' in planned) {
        node.result = { ...planned.emptyResult, success: planned.emptyResult.success ?? true };
        return;
      }
      node.plan = planned;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      node.result = {
        ...emptyPushProgress(),
        repository: repo,
        success: false,
        error: normalized,
        failures: [{ repository: repo, error: normalized }]
      };
      failedRepos.set(repoKey, normalized);
      return;
    }
  }

  await pushPlanEntries(node.plan, phase.kinds, options.batchSize);

  // 本相位推失败：立刻定案，后续相位不再推，并把失败传导给依赖它的仓库
  if (node.plan.error) {
    // 有条目没拿到回执：什么都不落，被拒也不算，下一轮整批重推
    node.result = pushRepositoryResult(node.plan, node.plan.pushed, 0, node.plan.error);
    failedRepos.set(repoKey, node.plan.error);
  }
}

/**
 * 判定级联节点是否没有推送资格
 *
 * @internal
 */
async function cascadeNodeIneligibility(sm: SyncManager, repo: RepositoryIdentifier): Promise<string | undefined> {
  const EntityType = sm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === repo.namespace && meta.name === repo.entity;
  });

  // 依赖图由 `config.entities` 构建，节点必然能反查回实体类
  if (!EntityType) {
    throw new RxDBError(`Internal error: entity not found for cascade node ${repositoryKey(repo)}`);
  }

  // 关联仓被单独关掉时同样跳过 —— 级联不是绕开开关的后门
  return resolvePushIneligibility(
    sm.rxdb,
    repo.namespace,
    repo.entity,
    getSyncType(getEntityMetadata(EntityType), sm.rxdb.entitySync)
  );
}

/**
 * 仓库级「零进度」基线：跳过或失败前一条都没推送时用它填充计数字段
 *
 * @internal
 */
function emptyPushProgress(): Omit<PushRepositoryResult, 'repository'> {
  return { pushed: 0, rejected: 0, failed: 0, compacted: 0, originalCount: 0, failures: [] };
}

/**
 * 依赖失败时，把这个节点**已经发给远端**的进度如实交出去。
 *
 * 阻断是逐相位判定的：DELETE 相位可能已经把删除动作推上去了，
 * 到 INSERT 相位才撞上依赖失败。此前这里无条件铺 {@link emptyPushProgress}，
 * 于是「远端确实收到了几条，结果里记作 0」—— 而水位线又因为本轮失败不会推进，
 * 调用方从计数上完全看不出发生过部分推送，回头对账「远端为什么多出几条」时无从查起。
 *
 * `failed` 与 {@link pushRepositoryResult} 同一个算式（`effectiveCount - pushed`），
 * 保证「阻断」和「提交失败」两条路径交出的计数可以直接相加。
 *
 * 第一个相位就被阻断时没有 `plan`，各计数本就该是 0。
 *
 * @param plan - 该节点已完成的推送计划；尚未进入规划阶段时为 `undefined`
 * @returns 除 `repository` 外的进度字段
 *
 * @internal
 */
function blockedPushProgress(plan: RepositoryPushPlan | undefined): Omit<PushRepositoryResult, 'repository'> {
  if (!plan) return emptyPushProgress();

  return {
    pushed: plan.pushed,
    // 没落库的被拒不算被拒：标记没写、对齐没做，下一轮会原样重推
    rejected: 0,
    failed: plan.effectiveCount - plan.pushed,
    compacted: plan.compacted,
    originalCount: plan.originalCount,
    failures: []
  };
}

type CompactedActionKind = 'deletes' | 'updates' | 'inserts';

interface CompactedPushEntry {
  /** 源变更所属分支，也是这一条推送时的目标分支，见 {@link compactPushEntriesByBranch} */
  branchId: string;
  actionKind: CompactedActionKind;
  key: string;
  action: SwitchVersionChange;
  sourceChanges: RxDBChange[];
}

interface CompactedPushBatch {
  actions: SwitchVersionActions;
  sourceChanges: RxDBChange[];
}

/**
 * 一个推送相位：本相位提交哪些动作类型，以及仓库该按什么顺序走。
 *
 * 分相位的理由见 {@link topologicalSortForAction}：INSERT 要父先、DELETE 要子先，
 * 一遍扫描不可能同时满足，只能拆成两趟。DELETE 先走完再走 INSERT/UPDATE ——
 * 反过来的话，「删掉旧父行 + 新建子行指向新父行」这种批次会在中途出现
 * 子行指向一个即将被删的父行的瞬态。
 */
interface PushPhase {
  readonly action: SortActionKind;
  readonly kinds: ReadonlySet<CompactedActionKind>;
}

const PUSH_PHASES: readonly PushPhase[] = [
  { action: 'DELETE', kinds: new Set<CompactedActionKind>(['deletes']) },
  { action: 'INSERT', kinds: new Set<CompactedActionKind>(['updates', 'inserts']) }
];

/** 单仓路径不涉及跨仓顺序，三类一次推完。 */
const ALL_ACTION_KINDS: ReadonlySet<CompactedActionKind> = new Set<CompactedActionKind>([
  'deletes',
  'updates',
  'inserts'
]);

/**
 * 按源变更**自己的**分支分组压缩，祖先在前（main 最先）。
 *
 * @remarks
 * 不能把祖先分支上未推送的变更与当前分支的并在一起压缩、再以当前分支为目标推送：
 * 远端只在目标为 main 时写业务表，其余分支只写日志；而 main 的配对校验要求每条 main 变更
 * 都有对应的业务写入（RX002 `unpaired_change`）。以 feature 为目标会丢掉 main 变更的业务写入，
 * 以 main 为目标又会把 feature 的改动写进 main，还要改写变更的 branchId——两条路都不对。
 * 各自成组、按各自分支推送，两边才都成立。
 *
 * 祖先在前：后代分支的变更建立在祖先状态之上，远端也应先见到祖先那一段。
 * 同一实体在不同分支上的变更因此各成一条，`effectiveCount` 按条累计。
 *
 * @param localChanges - 待推变更，`branchId` 都在 `branchIds` 内（查询时已按它过滤）
 * @param branchIds - 当前分支及其祖先，自身在前（{@link getAncestorBranchIds} 的顺序）
 *
 * @internal
 */
function compactPushEntriesByBranch(localChanges: RxDBChange[], branchIds: readonly string[]): CompactedPushEntry[] {
  const changesByBranch = new Map<string, RxDBChange[]>();
  for (const change of localChanges) {
    const { branchId } = change;
    // 查询按 branchId =/IN 过滤，NULL 分支的行进不来；走到这里说明查询与本函数的约定被打破
    if (branchId === undefined) throw new RxDBError(`Internal error: unpushed change ${change.id} has no branchId`);
    const group = changesByBranch.get(branchId) ?? [];
    group.push(change);
    changesByBranch.set(branchId, group);
  }
  return [...branchIds].reverse().flatMap(branchId => {
    const changes = changesByBranch.get(branchId);
    return changes ? compactBranchChanges(branchId, changes) : [];
  });
}

/** 单个分支内的压缩：与分组前的逻辑相同，只是范围限定在这一个分支的变更上。 */
function compactBranchChanges(branchId: string, changes: RxDBChange[]): CompactedPushEntry[] {
  const actions: SwitchVersionActions = { deletes: new Map(), updates: new Map(), inserts: new Map() };
  compactChanges(
    changes.map(c => ({
      id: c.id,
      namespace: c.namespace,
      entity: c.entity,
      entityId: c.entityId,
      type: c.type as 'INSERT' | 'UPDATE' | 'DELETE',
      branchId: c.branchId,
      patch: c.patch,
      inversePatch: c.inversePatch,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })),
    actions
  );
  return buildCompactedPushEntries(branchId, changes, actions);
}

function buildCompactedPushEntries(
  branchId: string,
  localChanges: RxDBChange[],
  actions: SwitchVersionActions
): CompactedPushEntry[] {
  const changesByKey = new Map<string, RxDBChange[]>();
  for (const change of localChanges) {
    const key = getRxDBChangeKey(change);
    const groupedChanges = changesByKey.get(key) ?? [];
    groupedChanges.push(change);
    changesByKey.set(key, groupedChanges);
  }

  const pushEntries: CompactedPushEntry[] = [];
  const appendEntries = (actionKind: CompactedActionKind, entries: SwitchVersionActions['inserts']): void => {
    for (const [key, action] of entries) {
      const sourceChanges = changesByKey.get(key);
      if (!sourceChanges?.length) {
        throw new RxDBError(`Missing source changes for compacted action: ${key}`);
      }

      pushEntries.push({
        branchId,
        actionKind,
        key,
        action,
        sourceChanges
      });
    }
  };

  appendEntries('deletes', actions.deletes);
  appendEntries('updates', actions.updates);
  appendEntries('inserts', actions.inserts);

  return pushEntries;
}

function createCompactedPushBatch(entries: CompactedPushEntry[]): CompactedPushBatch {
  const actions: SwitchVersionActions = {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  };
  const sourceChanges: RxDBChange[] = [];

  for (const entry of entries) {
    actions[entry.actionKind].set(entry.key, entry.action);
    for (const sourceChange of entry.sourceChanges) {
      sourceChanges.push(sourceChange);
    }
  }

  sourceChanges.sort((left, right) => left.id - right.id);
  return {
    actions,
    sourceChanges
  };
}

/**
 * 覆盖检查：远端结果必须与本批源变更的 localId 集合一一对应。
 *
 * @remarks
 * 缺项、重复、或多出未知 localId 都视为契约违反——远端没有按约定覆盖本批全部源变更，
 * 整轮必须失败、水位线不能推进（AC#14、FR-017）。检查先于任何本地写入，
 * 因此失败时本地不会留下任何 `remoteId`。
 */
function assertMergeResultCoversBatch(results: RemoteChangeResult[], sourceChanges: RxDBChange[]): void {
  const expectedLocalIds = new Set(sourceChanges.map(change => change.id));
  const seenLocalIds = new Set<number>();

  for (const result of results) {
    if (!expectedLocalIds.has(result.localId)) {
      throw new RxDBError(`Remote merge result references unknown local change: ${result.localId}`);
    }
    if (seenLocalIds.has(result.localId)) {
      throw new RxDBError(`Remote merge result duplicates local change: ${result.localId}`);
    }
    seenLocalIds.add(result.localId);
  }

  if (seenLocalIds.size !== expectedLocalIds.size) {
    const missing = [...expectedLocalIds].filter(localId => !seenLocalIds.has(localId));
    throw new RxDBError(`Remote merge result missing local changes: ${missing.join(', ')}`);
  }
}

/**
 * 被远端拒绝的一个压缩后条目：实体的全部源变更一起标记，共用同一份拒绝原因。
 *
 * @internal
 */
interface RejectedPushEntry {
  readonly entry: CompactedPushEntry;
  readonly rejection: RemoteChangeRejection;
}

/**
 * 一批回执按条目归类后的结果
 *
 * @internal
 */
interface ClassifiedPushBatch {
  readonly applied: Array<{ change: RxDBChange; remoteId: number }>;
  readonly rejected: RejectedPushEntry[];
}

/**
 * 判定一个条目是否被远端拒绝。
 *
 * @remarks
 * 被拒以实体为单位（data-model §7）：同一条目的源变更必须同进同退。一部分 applied、一部分被拒
 * 说明远端把一次合并后的写拆开处理了——本地无论按哪一半落库都会和远端对不上，只能整轮失败。
 * 这一步与覆盖检查一样先于任何本地写入。
 *
 * @returns 被拒时返回拒绝原因，全部 applied 时返回 `undefined`
 */
function entryRejection(
  entry: CompactedPushEntry,
  resultByLocalId: ReadonlyMap<number, RemoteChangeResult>
): RemoteChangeRejection | undefined {
  const statuses = entry.sourceChanges.map(change => {
    const result = resultByLocalId.get(change.id);
    // 覆盖检查已确保本批每条源变更都恰有一项回执
    if (!result) throw new RxDBError(`Remote merge result missing local changes: ${change.id}`);
    return result;
  });
  const rejected = statuses.find(
    (result): result is Extract<RemoteChangeResult, { status: 'rejected' }> => result.status === 'rejected'
  );
  if (!rejected) return undefined;
  if (statuses.some(result => result.status === 'applied')) {
    throw new RxDBError(`Remote merge result splits entity ${entry.key}: some source changes applied, some rejected`);
  }
  return rejected.rejection;
}

async function mergePushBatch(
  remoteAdapter: RxDBAdapterRemoteBase,
  branchId: string,
  entries: CompactedPushEntry[]
): Promise<ClassifiedPushBatch> {
  const batch = createCompactedPushBatch(entries);
  const mergeResult = await remoteAdapter.mergeChanges(batch.actions, branchId, batch.sourceChanges);
  assertMergeResultCoversBatch(mergeResult.results, batch.sourceChanges);

  const resultByLocalId = new Map(mergeResult.results.map(result => [result.localId, result]));
  const changeByLocalId = new Map(batch.sourceChanges.map(change => [change.id, change]));
  const classified: ClassifiedPushBatch = { applied: [], rejected: [] };
  for (const entry of entries) {
    const rejection = entryRejection(entry, resultByLocalId);
    if (rejection) classified.rejected.push({ entry, rejection });
  }
  // applied 按回执顺序收集：被拒条目整体不会出现 applied（上面已拒绝拆分），这里只需按状态过滤
  for (const result of mergeResult.results) {
    if (result.status !== 'applied') continue;
    const change = changeByLocalId.get(result.localId);
    // 覆盖检查已确保 result.localId ∈ 本批源变更
    if (!change) throw new RxDBError(`Remote merge result references unknown local change: ${result.localId}`);
    classified.applied.push({ change, remoteId: result.remoteId });
  }
  return classified;
}

/**
 * 一个仓库这一次推送的全部状态：查一次、压缩一次，之后各相位只从这里取自己那部分。
 *
 * 拆出这层是分相位的前提。若让两个相位各自调一遍
 * 「查变更 → 压缩 → 推 → 推进水位线」，`originalCount` / `compacted` 会被算两遍，
 * 水位线也会在第一个相位就提前推进，把第二个相位的变更整批吞掉。
 *
 * @internal
 */
interface RepositoryPushPlan {
  readonly repository: RepositoryIdentifier;
  readonly entityType: EntityType;
  readonly entries: CompactedPushEntry[];
  readonly localChanges: RxDBChange[];
  readonly repoSync: RxDBSync;
  readonly localAdapter: Awaited<ReturnType<SyncManager['getLocalRepositories']>>['adapter'];
  readonly remoteAdapter: RxDBAdapterRemoteBase;
  readonly branchId: string;
  /** 规划时的 {@link SyncManager.branchSwitchGeneration}；提交时据此识别远端往返期间的分支切换。 */
  readonly branchGeneration: number;
  readonly originalCount: number;
  readonly effectiveCount: number;
  readonly compacted: number;
  /** 各相位累积被远端接受（applied）的条目数；被拒的不算。 */
  pushed: number;
  /** 各相位累积拿到的远端 id，最终一并落库。 */
  readonly remoteIdsByChange: Map<RxDBChange, number>;
  /** 各相位累积被远端拒绝的条目，最终与远端 id 同一个事务落库。 */
  readonly rejectedEntries: RejectedPushEntry[];
  error?: Error;
}

/**
 * 阶段一：查出待推变更并压缩，但**一条都不推**。
 *
 * 返回 `{ emptyResult }` 表示这个仓库这一轮无事可做 —— 要么本就没有未推变更，
 * 要么整批被本地压缩抵消；后者该推进的水位线已在此推进。
 *
 * @internal
 */
async function planRepositoryPush(
  sm: SyncManager,
  namespace: string,
  entity: string,
  inFlight: PushInFlightSession
): Promise<RepositoryPushPlan | { emptyResult: PushRepositoryResult }> {
  const rxdb = sm.rxdb;

  // 验证远端适配器
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  await sm.getRemoteRepositories(); // 确保远端已配置
  const { adapter: localAdapter } = await sm.getLocalRepositories();

  // 代际先于分支读取：两者之间若插进一次切换，提交时代际对不上，宁可多拒一轮也不错配
  const branchGeneration = sm.branchSwitchGeneration;
  // 获取当前分支
  const branch = await sm.getCurrentBranch();

  // 获取或创建 RxDBSync 记录
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);

  const EntityType = sm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === namespace && meta.name === entity;
  });
  // 调用方（单仓入口 / 级联资格闸门）已按同一条件确认过实体存在
  if (!EntityType) throw new RxDBError(`Entity not found: ${namespace}:${entity}`);
  const metadata = getEntityMetadata(EntityType);
  const syncType = getSyncType(metadata, sm.rxdb.entitySync);

  const repoSync = await getOrCreateSyncRecord(
    repoSyncRepo,
    {
      namespace,
      entity,
      branchId: branch.id,
      syncType
    },
    () => rxdb.entityManager.instantiate(RxDBSync)
  );

  const lastPushedChangeId: number | null = repoSync.lastPushedChangeId;

  // 获取祖先分支列表（包含自身），查询所有祖先分支的未推送变更
  const branchIds = await getAncestorBranchIds(sm, branch.id);

  const changeRepo = localAdapter.getRepository(RxDBChange);

  let localChanges: RxDBChange[];
  if (branchIds.length === 1) {
    // 单分支（main 或无父分支），沿用原逻辑
    localChanges = await queryUnpushedChanges(changeRepo, branchIds, lastPushedChangeId, namespace, [entity]);
  } else {
    // 多分支：收集每个祖先分支的水位线，用最小值查询
    let minWatermark: number | null = lastPushedChangeId;
    for (const ancestorBranchId of branchIds.slice(1)) {
      const ancestorSyncId = `${namespace}:${entity}:${ancestorBranchId}`;
      const ancestorSyncResults = await repoSyncRepo.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: ancestorSyncId }] },
        limit: 1
      });
      const ancestorWatermark = ancestorSyncResults[0]?.lastPushedChangeId ?? null;
      if (ancestorWatermark === null) {
        minWatermark = null;
        break;
      }
      if (minWatermark === null || ancestorWatermark < minWatermark) {
        minWatermark = ancestorWatermark;
      }
    }
    localChanges = await queryUnpushedChanges(changeRepo, branchIds, minWatermark, namespace, [entity]);
  }

  const originalCount = localChanges.length;

  if (originalCount === 0) {
    return { emptyResult: { ...emptyPushProgress(), repository: { namespace, entity } } };
  }

  // 压缩变更：按变更自己的分支分组，见 compactPushEntriesByBranch
  const entries = compactPushEntriesByBranch(localChanges, branchIds);
  const effectiveCount = entries.length;
  const compacted = originalCount - effectiveCount;

  // 无有效变更：整批被本地压缩抵消（如 INSERT → DELETE 且服务器从未见过这条数据）。
  //
  // 仍然必须推进水位线：这些变更的 `remoteId` / `revertChangeId` 永远保持 null，
  // 后续任何一次 push 都不可能把它们发出去。不推进的话每次 push 都会重新查出、
  // 重新压缩同一批，历史越长开销越大；`calculatePushableCount` 用的也是这条水位线，
  // 会把它们永远算作「待推送」。成功路径同样是用**全部** localChanges 的最大 id
  // （而非实际推送的那些）推进水位线，这里保持一致。
  //
  // 不写 `lastPushedAt`：没有任何数据真的发到远端，那是纯展示字段，不该被伪造。
  if (effectiveCount === 0) {
    const maxChangeId = localChanges.reduce((max, c) => (c.id > max ? c.id : max), localChanges[0].id);
    await repoSyncRepo.update(repoSync, { lastPushedChangeId: maxChangeId, updatedAt: new Date() });

    return {
      emptyResult: {
        ...emptyPushProgress(),
        repository: { namespace, entity },
        compacted: originalCount,
        originalCount
      }
    };
  }

  // 获取远端适配器
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();

  // 认领必须在**返回计划之前**：调用方拿到计划的下一步就是往远端发，
  // 认领晚一拍就等于把那一拍重新暴露给 undo。
  inFlight.claim(
    `${namespace}:${entity}`,
    localChanges.reduce((max, c) => (c.id > max ? c.id : max), localChanges[0].id)
  );

  return {
    repository: { namespace, entity },
    entityType: EntityType,
    entries,
    localChanges,
    repoSync,
    localAdapter,
    remoteAdapter,
    branchId: branch.id,
    branchGeneration,
    originalCount,
    effectiveCount,
    compacted,
    pushed: 0,
    remoteIdsByChange: new Map<RxDBChange, number>(),
    rejectedEntries: []
  };
}

/**
 * 阶段二：把计划里属于本相位的条目发给远端，**不落库**。
 *
 * applied 的条目累加进 `plan.pushed`，拿到的远端 id 累加进 `plan.remoteIdsByChange`，
 * 被拒的条目累加进 `plan.rejectedEntries`，都留给 {@link commitPushPlans} 一次性提交。
 *
 * 前一个相位已失败时直接返回：继续推只会在一个已知不会落库的批次上白跑一趟远端。
 *
 * @internal
 */
async function pushPlanEntries(
  plan: RepositoryPushPlan,
  kinds: ReadonlySet<CompactedActionKind>,
  batchSize: number
): Promise<void> {
  if (plan.error) return;

  const entries = plan.entries.filter(entry => kinds.has(entry.actionKind));
  if (entries.length === 0) return;

  const { namespace, entity } = plan.repository;

  for (const { branchId, entries: batchEntries } of splitPushBatches(entries, batchSize)) {
    try {
      const classified = await mergePushBatch(plan.remoteAdapter, branchId, batchEntries);
      for (const { change, remoteId } of classified.applied) {
        plan.remoteIdsByChange.set(change, remoteId);
      }
      for (const rejected of classified.rejected) plan.rejectedEntries.push(rejected);
      plan.pushed += batchEntries.length - classified.rejected.length;
    } catch (error) {
      console.error(`Error pushing changes to remote for repository [${namespace}/${entity}]:`, error);
      plan.error = error instanceof Error ? error : new Error(String(error));
      return;
    }
  }
}

/**
 * 一次 `mergeChanges` 的条目：同属一个目标分支。
 *
 * @internal
 */
interface PushBatchSlice {
  readonly branchId: string;
  readonly entries: CompactedPushEntry[];
}

/**
 * 切批：一批只含一个分支的条目（一次 `mergeChanges` 只有一个目标分支），且不超过 `batchSize`。
 *
 * @remarks
 * 依赖条目已按分支成段排列（{@link compactPushEntriesByBranch} 的输出，按动作类型过滤后仍成段），
 * 因此只需在分支变化处断开，批次顺序即祖先在前。
 *
 * @internal
 */
function splitPushBatches(entries: readonly CompactedPushEntry[], batchSize: number): PushBatchSlice[] {
  const batches: PushBatchSlice[] = [];
  for (const entry of entries) {
    const last = batches.at(-1);
    if (last?.branchId === entry.branchId && last.entries.length < batchSize) {
      last.entries.push(entry);
    } else {
      batches.push({ branchId: entry.branchId, entries: [entry] });
    }
  }
  return batches;
}

/**
 * 阶段三：全部相位跑完后，把一组仓库的回执（远端 id + 被拒标记）、被拒实体的本地对齐和水位线一次性落库。
 *
 * @remarks
 * 只有每个条目都拿到了回执的仓库才落库：部分成功就推进水位线会让没推上去的那些永远丢失。
 * 被拒是回执的一种，不是失败——被拒条目照样越过水位线，标记为终态，不再重发（data-model §7）。
 *
 * 可落库的仓库**共用一个本地事务**，全有或全无：被拒新建要在本地删除（子先父后），被拒删除要在本地
 * 恢复（父先子后），两个方向相反，逐仓各开一个事务必然有一个方向先撞上本地外键。代价是同批任一仓库
 * 落库失败，其他仓库也一起不落库、下一轮重推。
 *
 * 落库成功后把被拒清单追加进 `rejections`，由调用方在整次推送结束时统一上报：
 * `reportRejections` 是整体替换语义，逐仓上报只会留下最后一个仓库的清单。
 *
 * @param sm - SyncManager 实例
 * @param plans - 已跑完全部相位的推送计划，按 INSERT 拓扑序（父先子后）
 * @param rejections - 落库成功后追加被拒清单的收集器
 * @returns 每个计划的推送结果
 *
 * @internal
 */
async function commitPushPlans(
  sm: SyncManager,
  plans: readonly RepositoryPushPlan[],
  rejections: SyncRejection[]
): Promise<Map<RepositoryPushPlan, PushRepositoryResult>> {
  const results = new Map<RepositoryPushPlan, PushRepositoryResult>();
  const ready: RepositoryPushPlan[] = [];
  for (const plan of plans) {
    // 还有条目没拿到回执（某批失败）：什么都不落，被拒也不算，下一轮整批重推
    if (plan.effectiveCount - plan.pushed - plan.rejectedEntries.length > 0) {
      results.set(plan, pushRepositoryResult(plan, plan.pushed, 0, plan.error));
    } else {
      ready.push(plan);
    }
  }
  if (ready.length === 0) return results;

  try {
    const committed = await persistPushReceipts(sm, ready);
    for (const rejection of committed) rejections.push(rejection);
    for (const plan of ready) {
      results.set(plan, pushRepositoryResult(plan, plan.pushed, plan.rejectedEntries.length, undefined));
    }
  } catch (error) {
    const repositories = ready.map(plan => repositoryKey(plan.repository)).join(', ');
    console.error(`Error saving push state for repositories [${repositories}]:`, error);
    const normalized = error instanceof Error ? error : new Error(String(error));
    for (const plan of ready) results.set(plan, pushRepositoryResult(plan, 0, 0, normalized));
  }
  return results;
}

/**
 * 按计数组装仓库结果；`failed` 由不变式 `effectiveCount = pushed + failed + rejected` 反推。
 *
 * @internal
 */
function pushRepositoryResult(
  plan: RepositoryPushPlan,
  pushed: number,
  rejected: number,
  error: Error | undefined
): PushRepositoryResult {
  const { repository } = plan;
  const failed = plan.effectiveCount - pushed - rejected;
  return {
    repository,
    success: failed === 0,
    error,
    pushed,
    rejected,
    failed,
    compacted: plan.compacted,
    originalCount: plan.originalCount,
    failures: error ? [{ repository, error }] : []
  };
}

/**
 * 回执落库：applied 写 `remoteId`，被拒写 `rejectedAt` / `rejection`，对齐被拒实体，推进水位线——同一个本地事务。
 *
 * @remarks
 * 被拒实体的远端当前行在**事务外**先取齐（远端往返不能夹在本地事务里）；取不到就整轮不提交，
 * 与提交失败同一个出口：内存里的标记回滚，水位线不动，下一轮重推会再拿一次回执。
 *
 * 对齐分两段：本地删除按计划逆序（子先父后），本地恢复按计划顺序（父先子后）。父行先删会撞上
 * RESTRICT，或经 CASCADE 带走子行、让子仓的删除拿不到前像（删除事件的前像取自删除时返回的本地行）。
 * 同一仓库内的自引用外键不在此列，仍按单次 `mergeChanges` 的顺序执行。
 *
 * @param sm - SyncManager 实例
 * @param plans - 回执齐全的推送计划，按 INSERT 拓扑序（父先子后）
 * @returns 落库成功后的被拒清单
 *
 * @internal
 */
async function persistPushReceipts(sm: SyncManager, plans: readonly RepositoryPushPlan[]): Promise<SyncRejection[]> {
  const prepared: { plan: RepositoryPushPlan; remoteRows: Map<string, Record<string, unknown>> }[] = [];
  for (const plan of plans) prepared.push({ plan, remoteRows: await fetchRejectedRemoteRows(plan) });

  const pushedAt = new Date();
  const restorers = plans.map(snapshotPushState);

  try {
    // 计划里的本地适配器都来自同一个 `sm.getLocalRepositories()`
    await plans[0].localAdapter.transaction(async executor => {
      await assertPlansOnActiveBranch(sm, executor, plans);
      const alignments: RejectionAlignment[] = [];
      for (const { plan, remoteRows } of prepared) {
        await writePushReceipts(executor, plan, pushedAt);
        alignments.push(await collectRejectionAlignment(executor, plan, remoteRows));
      }
      for (const { removals } of [...alignments].reverse()) await alignRejectedEntities(executor, removals);
      for (const { restores } of alignments) await alignRejectedEntities(executor, restores);
      for (const plan of plans) {
        await executor.getRepository(RxDBSync).update(plan.repoSync, {
          lastPushedChangeId: maxPlanChangeId(plan),
          lastPushedAt: pushedAt,
          updatedAt: pushedAt
        });
      }
    });
  } catch (error) {
    for (const restore of restorers) restore();
    throw error;
  }

  return plans.flatMap(plan => toSyncRejections(plan.rejectedEntries, pushedAt));
}

/**
 * 本轮落库要动的变更：拿到远端 id 的，以及被拒条目的全部源变更。
 *
 * @internal
 */
function pushTouchedChanges(plan: RepositoryPushPlan): RxDBChange[] {
  return [...plan.remoteIdsByChange.keys(), ...plan.rejectedEntries.flatMap(({ entry }) => entry.sourceChanges)];
}

/**
 * 本计划全部源变更里最大的 change id，即落库后的水位线。
 *
 * @internal
 */
function maxPlanChangeId(plan: RepositoryPushPlan): number {
  // 使用 reduce 求最大值，避免 Math.max(...arr) 在超大数组上触发调用栈溢出
  return plan.localChanges.reduce((max, c) => (c.id > max ? c.id : max), plan.localChanges[0].id);
}

/**
 * 记下落库会改动的内存状态（变更的回执字段、同步记录的水位线），返回把它们还原的函数。
 *
 * @internal
 */
function snapshotPushState(plan: RepositoryPushPlan): () => void {
  const { repoSync } = plan;
  const previousChanges = pushTouchedChanges(plan).map(change => ({
    change,
    remoteId: change.remoteId,
    rejectedAt: change.rejectedAt,
    rejection: change.rejection
  }));
  const previousSyncState = {
    lastPushedChangeId: repoSync.lastPushedChangeId,
    lastPushedAt: repoSync.lastPushedAt,
    updatedAt: repoSync.updatedAt
  };
  return () => {
    for (const previous of previousChanges) {
      previous.change.remoteId = previous.remoteId;
      previous.change.rejectedAt = previous.rejectedAt;
      previous.change.rejection = previous.rejection;
    }
    Object.assign(repoSync, previousSyncState);
  };
}

/**
 * 在事务内写回执：applied 写 `remoteId`，被拒的源变更写 `rejectedAt` / `rejection`。
 *
 * @internal
 */
async function writePushReceipts(executor: TransactionExecutor, plan: RepositoryPushPlan, at: Date): Promise<void> {
  for (const [change, remoteId] of plan.remoteIdsByChange) change.remoteId = remoteId;
  for (const { entry, rejection } of plan.rejectedEntries) {
    for (const change of entry.sourceChanges) {
      change.rejectedAt = at;
      change.rejection = rejection;
    }
  }
  const touched = pushTouchedChanges(plan);
  if (touched.length > 0) await executor.saveMany(touched);
}

/**
 * 被拒对齐改写的是**当前 active 分支**的业务投影，提交前必须确认它仍是规划时的那个分支。
 *
 * @remarks
 * 远端往返期间切过分支时，把旧分支的被拒对齐写下去会覆盖另一个分支的投影（切到 feature），
 * 或改写一份被切走又重建过的投影（main→feature→main：分支 id 对得上，激活代际对不上）。
 * 此时在任何本地写入之前让整轮提交失败：内存标记回滚、水位线不动，回到该分支后的下一轮推送会再拿一次回执。
 *
 * active 分支经**本事务**读：走 `sm.getCurrentBranch()` 会排在已持有的事务后面。
 * 激活代际只覆盖本实例内的切换；跨标签页的切换只由持久化的 active 分支兜住，A→B→A 不可见。
 *
 * 没有被拒时不校验：只写回执与水位线、不碰业务投影，不值得为一次分支切换让正常推送整轮重推。
 *
 * @internal
 */
async function assertPlansOnActiveBranch(
  sm: SyncManager,
  executor: TransactionExecutor,
  plans: readonly RepositoryPushPlan[]
): Promise<void> {
  if (!plans.some(plan => plan.rejectedEntries.length > 0)) return;

  const active = await assertSingleActiveBranch(executor);
  const generation = sm.branchSwitchGeneration;
  const stale = plans.find(plan => plan.branchId !== active.id || plan.branchGeneration !== generation);
  if (stale) {
    throw new RxDBError(
      `Branch switched while pushing ${repositoryKey(stale.repository)} from branch ${stale.branchId}; ` +
        `rejected receipts are not applied to active branch ${active.id}.`
    );
  }
}

/**
 * 向远端取被拒实体的当前行，按 {@link rejectedRowKey} 索引；远端没有的行不出现在结果里。
 *
 * @remarks
 * 按回执里的实体引用分组查（`namespace:entity` 作为 `findByIds` 的实体名），不假设被拒实体都属于本仓。
 * 本轮无被拒时不查远端。
 *
 * @internal
 */
async function fetchRejectedRemoteRows(plan: RepositoryPushPlan): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  const idsByScope = new Map<string, string[]>();
  for (const { rejection } of plan.rejectedEntries) {
    const scope = `${rejection.entity.namespace}:${rejection.entity.entity}`;
    const ids = idsByScope.get(scope) ?? [];
    ids.push(rejection.entity.entityId);
    idsByScope.set(scope, ids);
  }

  for (const [scope, ids] of idsByScope) {
    const found = await firstValueFrom(plan.remoteAdapter.findByIds<Record<string, unknown>>(scope, ids));
    for (const row of found) rows.set(`${scope}:${String(row['id'])}`, row);
  }
  return rows;
}

/**
 * 被拒实体在 {@link fetchRejectedRemoteRows} 结果里的键：回执的实体引用，`entityId` 已是字符串形式。
 *
 * @internal
 */
function rejectedRowKey(rejection: RemoteChangeRejection): string {
  const { namespace, entity, entityId } = rejection.entity;
  return `${namespace}:${entity}:${entityId}`;
}

/**
 * 一个仓库被拒实体的本地对齐动作，按方向拆开：移除与恢复要分处两段执行，见 {@link persistPushReceipts}。
 *
 * @internal
 */
interface RejectionAlignment {
  /** 远端无行：本地行移除（被拒的新建 / 更新） */
  readonly removals: SwitchVersionActions;
  /** 远端有行：本地行覆盖成远端值，被拒的删除即重建 */
  readonly restores: SwitchVersionActions;
}

const emptyActions = (): SwitchVersionActions => ({ deletes: new Map(), updates: new Map(), inserts: new Map() });

/**
 * 算出被拒实体的本地对齐动作：远端有行就覆盖（被拒的删除即恢复），远端无行就移除。
 *
 * @remarks
 * 被拒实体在本批之外还有更新的待推变更（远端往返期间用户又改过）时**不对齐它**：
 * 覆盖掉会吞掉用户那次还没推的改动；它的下一轮推送会拿到自己的回执。这里不按分支过滤，
 * 任一分支上有更新的待推变更都算——宁可少对齐一次，也不覆盖用户改动。
 *
 * @internal
 */
async function collectRejectionAlignment(
  executor: TransactionExecutor,
  plan: RepositoryPushPlan,
  remoteRows: ReadonlyMap<string, Record<string, unknown>>
): Promise<RejectionAlignment> {
  const alignment: RejectionAlignment = { removals: emptyActions(), restores: emptyActions() };
  if (plan.rejectedEntries.length === 0) return alignment;

  const { namespace, entity } = plan.repository;
  const newerPending = await executor.getRepository(RxDBChange).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'namespace', operator: '=', value: namespace },
        { field: 'entity', operator: '=', value: entity },
        {
          field: 'entityId',
          operator: 'in',
          value: getRxDBChangeEntityIdQueryValues(
            plan.rejectedEntries.map(({ rejection }) => rejection.entity.entityId)
          )
        },
        { field: 'id', operator: '>', value: maxPlanChangeId(plan) },
        { field: 'revertChangeId', operator: '=', value: null },
        { field: 'remoteId', operator: '=', value: null },
        { field: 'rejectedAt', operator: '=', value: null }
      ]
    } as never
  });
  const skipped = new Set(newerPending.map(change => getRxDBChangeKey(change)));

  for (const { entry, rejection } of plan.rejectedEntries) {
    if (!skipped.has(entry.key)) addAlignmentAction(alignment, entry, remoteRows.get(rejectedRowKey(rejection)));
  }
  return alignment;
}

/**
 * 把一段对齐动作写进本地业务表。
 *
 * @remarks
 * 走 `executor.mergeChanges(…, true)` 关触发器写入：对齐是「把远端投影抄回本地」，不是一次用户改动，
 * 不能产生 `RxDBChange`，否则下一轮会把远端拒绝过的值又推一次。
 * 受信写入声明是一次性的，每次 `mergeChanges` 前都要重新声明。
 *
 * @internal
 */
async function alignRejectedEntities(executor: TransactionExecutor, actions: SwitchVersionActions): Promise<void> {
  if (actions.inserts.size + actions.updates.size + actions.deletes.size === 0) return;

  declareTrustedWrite(executor, {
    file: 'push-repository.ts',
    symbol: 'alignRejectedEntities',
    intent: TrustedWriteIntent.remote_sync
  });
  await executor.mergeChanges(actions, undefined, true);
}

/**
 * 一个被拒条目对应的对齐动作：本地行要变成远端行（或在远端无行时消失）。
 *
 * @remarks
 * 移除动作不带前像：本地行此刻还在（删除子先父后保证它不会先被父行的 CASCADE 带走），
 * 前像由适配器在删除时从本地行取得，不在这里伪造。
 *
 * @internal
 */
function addAlignmentAction(
  alignment: RejectionAlignment,
  entry: CompactedPushEntry,
  remoteRow: Record<string, unknown> | undefined
): void {
  if (remoteRow) {
    // 被拒的删除：本地行已经没了，按远端值重建；其余：本地行还在，覆盖成远端值
    const { restores } = alignment;
    const target = entry.actionKind === 'deletes' ? restores.inserts : restores.updates;
    target.set(entry.key, { patch: remoteRow, inversePatch: null });
    return;
  }
  // 远端无行且被拒的就是删除：两边都没有，无事可做
  if (entry.actionKind !== 'deletes') {
    alignment.removals.deletes.set(entry.key, { patch: null, inversePatch: null });
  }
}

const ACTION_KIND_OP = {
  deletes: 'DELETE',
  updates: 'UPDATE',
  inserts: 'INSERT'
} as const satisfies Record<CompactedActionKind, SyncRejection['op']>;

/**
 * 被拒条目 → 上报给 `SyncStateHub` 的清单项；`op` 取压缩后真正发给远端的那个操作。
 *
 * @internal
 */
function toSyncRejections(rejectedEntries: readonly RejectedPushEntry[], at: Date): SyncRejection[] {
  return rejectedEntries.map(({ entry, rejection }) => ({
    namespace: rejection.entity.namespace,
    entity: rejection.entity.entity,
    entityId: rejection.entity.entityId,
    op: ACTION_KIND_OP[entry.actionKind],
    code: rejection.code,
    reason: rejection.reason,
    message: rejection.message,
    ...(rejection.dependsOn ? { dependsOn: rejection.dependsOn } : {}),
    at,
    changeIds: entry.sourceChanges.map(change => change.id)
  }));
}

/**
 * 整次推送结束后把收集到的被拒清单上报一次；没有被拒就不报（不清掉上一轮的清单）。
 *
 * @param sm - SyncManager 实例
 * @param rejections - 整次操作已落库的被拒清单
 *
 * @internal
 */
export function reportPushRejections(sm: SyncManager, rejections: readonly SyncRejection[]): void {
  if (rejections.length > 0) sm.rxdb.syncState.reportRejections(rejections);
}

/**
 * 单仓库推送变更（内部实现）
 *
 * 不涉及跨仓顺序，三类动作一趟推完。
 *
 * @internal
 */
async function pushSingleRepository(
  sm: SyncManager,
  namespace: string,
  entity: string,
  options: Required<PushRepositoryOptions>,
  inFlight: PushInFlightSession,
  rejections: SyncRejection[]
): Promise<PushRepositoryResult> {
  const planned = await planRepositoryPush(sm, namespace, entity, inFlight);
  if ('emptyResult' in planned) return planned.emptyResult;

  await pushPlanEntries(planned, ALL_ACTION_KINDS, options.batchSize);
  const result = (await commitPushPlans(sm, [planned], rejections)).get(planned);
  if (!result) throw new RxDBError(`Internal error: push result missing for ${namespace}:${entity}`);
  // 与级联路径同一个失败出口，见 throwPushFailure 的 @remarks
  if (!result.success) throwPushFailure(result);
  return result;
}

/**
 * 查询指定仓库的未推送变更
 *
 * @internal
 */
async function queryUnpushedChanges(
  changeRepo: IRepository<typeof RxDBChange>,
  branchIds: string[],
  lastPushedChangeId: number | null,
  namespace: string,
  entityFilter: string[]
): Promise<RxDBChange[]> {
  const baseRules: RxDBChangeRuleGroup['rules'] = [
    { field: 'revertChangeId', operator: '=', value: null },
    { field: 'remoteId', operator: '=', value: null },
    // 被拒变更（rejectedAt 非空）的 remoteId 也一直是 null，但它永远不会再被推送，
    // 必须和 remoteId = null 一起排除，否则会被当成待推变更反复捞出来
    { field: 'rejectedAt', operator: '=', value: null },
    // 实体名在不同 namespace 下可以重名，只按 entity 过滤会把别的 namespace 的
    // 变更一起捞出来错推，同时把对方的水位线推进导致后续漏推
    { field: 'namespace', operator: '=', value: namespace }
  ];

  // 分支过滤（支持多分支）
  if (branchIds.length === 1) {
    baseRules.push({ field: 'branchId', operator: '=', value: branchIds[0] });
  } else {
    baseRules.push({ field: 'branchId', operator: 'in', value: branchIds });
  }

  // 添加仓库过滤（实体名）
  if (entityFilter && entityFilter.length > 0) {
    baseRules.push({ field: 'entity', operator: 'in', value: entityFilter });
  }

  // 添加变更 ID 过滤
  if (lastPushedChangeId !== null) {
    baseRules.push({ field: 'id', operator: '>', value: lastPushedChangeId });
  }

  return await changeRepo.find({
    where: {
      combinator: 'and',
      rules: baseRules
    },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });
}
