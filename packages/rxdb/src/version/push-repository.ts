/**
 * @fileoverview 仓库级别的推送操作
 *
 * 在仓库（实体类型）级别提供细粒度的推送控制，
 * 支持通过依赖图分析的级联同步。
 */

import { IRepository } from '../repository/repository.interface.js';
import type { RemoteMergeResult, RxDBAdapterRemoteBase } from '../rxdb-adapter.js';
import { RepositorySyncBeginEvent, RepositorySyncCompleteEvent, RepositorySyncErrorEvent } from '../rxdb-events.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError, RxDBPartialSyncError } from '../RxDBError.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import { RxDBChangeRuleGroup } from '../system/types.js';
import { getAncestorBranchIds } from './branch-utils.js';
import { findBlockingDependency, repositoryKey, RxDBDependencyFailedError } from './cascade-contract.js';
import { compactChanges } from './compact-changes.js';
import { buildDependencyGraph, type DependencyGraph, type RepositoryIdentifier } from './dependency-graph.js';
import { getOrCreateSyncRecord, resolvePushIneligibility } from './sync-record-utils.js';
import { getSyncType } from './sync-type-utils.js';
import { dependencyEdgeForAction, topologicalSortForAction, type SortActionKind } from './topological-sort.js';
import type {
  PushRepositoryResult,
  SwitchVersionActions,
  SwitchVersionChange,
  SyncFailure
} from './VersionManager.interface.js';
import type { VersionManager } from './VersionManager.js';
import { getRxDBChangeKey } from './VersionManager.utils.js';

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
 * @param vm - VersionManager 实例
 * @param namespace - 实体命名空间
 * @param entity - 实体名称
 * @param options - 推送选项
 * @returns 推送结果
 *
 * @example
 * ```ts
 * // 在不进行级联的情况下推送 Todo 仓库
 * const result = await pushRepository(vm, 'public', 'Todo', {
 *   includeRelated: false
 * });
 *
 * // 推送 Todo 以及所有依赖它的实体（如 Comment）
 * const result = await pushRepository(vm, 'public', 'Todo', {
 *   includeRelated: true
 * });
 * ```
 */
export async function pushRepository(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: PushRepositoryOptions
): Promise<PushRepositoryResult> {
  const opts: Required<PushRepositoryOptions> = {
    batchSize: options?.batchSize === undefined ? DEFAULT_PUSH_REPOSITORY_OPTIONS.batchSize : options.batchSize,
    includeRelated:
      options?.includeRelated === undefined ? DEFAULT_PUSH_REPOSITORY_OPTIONS.includeRelated : options.includeRelated
  };
  const rxdb = vm.rxdb;

  // 触发开始事件
  rxdb.dispatchEvent(new RepositorySyncBeginEvent('push', namespace, entity, opts.includeRelated));

  try {
    assertBatchSize(opts.batchSize);
    const result = await _pushRepositoryImpl(vm, namespace, entity, opts);

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
  }
}

/**
 * pushRepository 的内部实现
 */
async function _pushRepositoryImpl(
  vm: VersionManager,
  namespace: string,
  entity: string,
  opts: Required<PushRepositoryOptions>
): Promise<PushRepositoryResult> {
  // 验证仓库是否存在
  const EntityType = vm.rxdb.config.entities.find(e => {
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
  const ineligible = await resolvePushIneligibility(vm, namespace, entity, getSyncType(metadata, vm.rxdb.config.sync));

  if (ineligible) {
    throw new RxDBError(`Cannot push repository ${namespace}:${entity}: ${ineligible}.`);
  }

  // 处理级联推送
  if (opts.includeRelated) {
    return await pushWithCascade(vm, namespace, entity, opts);
  }

  // 单仓库推送
  return await pushSingleRepository(vm, namespace, entity, opts);
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
 * （{@link commitRepositoryPush}）。否则 `originalCount` / `compacted` 会被算两遍，
 * 且第一个相位就把水位线推到最大 change id，第二个相位的变更会被整批吞掉。
 *
 * @internal
 */
async function pushWithCascade(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options: Required<PushRepositoryOptions>
): Promise<PushRepositoryResult> {
  // 构建依赖图
  const entities = vm.rxdb.config.entities.map(e => getEntityMetadata(e));
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
      await runCascadePhase(vm, graph, repo, phase, options, nodes, failedRepos);
    }
  }

  // 相位全部跑完才落库：水位线必须一次推到位，中途推进会吞掉后一个相位的变更
  const results: PushRepositoryResult[] = [];
  const failures: SyncFailure[] = [];

  for (const repo of orderRepos('INSERT')) {
    const node = nodes.get(repositoryKey(repo));
    // 每个相位都会遍历全部仓库，节点必然已建好
    if (!node) throw new RxDBError(`Internal error: cascade node missing for ${repositoryKey(repo)}`);

    const result = node.result ?? (await commitRepositoryPush(node.plan!));
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
  vm: VersionManager,
  graph: DependencyGraph,
  repo: RepositoryIdentifier,
  phase: PushPhase,
  options: Required<PushRepositoryOptions>,
  nodes: Map<string, CascadeNode>,
  failedRepos: Map<string, Error>
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
    const ineligible = await cascadeNodeIneligibility(vm, repo);
    if (ineligible) {
      node.result = { ...emptyPushProgress(), repository: repo, success: true, skipped: ineligible };
      return;
    }

    try {
      const planned = await planRepositoryPush(vm, repo.namespace, repo.entity);
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
    node.result = await commitRepositoryPush(node.plan);
    failedRepos.set(repoKey, node.plan.error);
  }
}

/**
 * 判定级联节点是否没有推送资格
 *
 * @internal
 */
async function cascadeNodeIneligibility(vm: VersionManager, repo: RepositoryIdentifier): Promise<string | undefined> {
  const EntityType = vm.rxdb.config.entities.find(e => {
    const meta = getEntityMetadata(e);
    return meta.namespace === repo.namespace && meta.name === repo.entity;
  });

  // 依赖图由 `config.entities` 构建，节点必然能反查回实体类
  if (!EntityType) {
    throw new RxDBError(`Internal error: entity not found for cascade node ${repositoryKey(repo)}`);
  }

  // 关联仓被单独关掉时同样跳过 —— 级联不是绕开开关的后门
  return resolvePushIneligibility(
    vm,
    repo.namespace,
    repo.entity,
    getSyncType(getEntityMetadata(EntityType), vm.rxdb.config.sync)
  );
}

/**
 * 仓库级「零进度」基线：跳过或失败前一条都没推送时用它填充计数字段
 *
 * @internal
 */
function emptyPushProgress(): Omit<PushRepositoryResult, 'repository'> {
  return { pushed: 0, failed: 0, compacted: 0, originalCount: 0, failures: [] };
}

/**
 * 依赖失败时，把这个节点**已经发给远端**的进度如实交出去。
 *
 * 阻断是逐相位判定的：DELETE 相位可能已经把删除动作推上去了，
 * 到 INSERT 相位才撞上依赖失败。此前这里无条件铺 {@link emptyPushProgress}，
 * 于是「远端确实收到了几条，结果里记作 0」—— 而水位线又因为本轮失败不会推进，
 * 调用方从计数上完全看不出发生过部分推送，回头对账「远端为什么多出几条」时无从查起。
 *
 * `failed` 与 {@link commitRepositoryPush} 同一个算式（`effectiveCount - pushed`），
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
    failed: plan.effectiveCount - plan.pushed,
    compacted: plan.compacted,
    originalCount: plan.originalCount,
    failures: []
  };
}

type CompactedActionKind = 'deletes' | 'updates' | 'inserts';

interface CompactedPushEntry {
  actionKind: CompactedActionKind;
  key: string;
  action: SwitchVersionChange;
  sourceChanges: RxDBChange[];
}

interface CompactedPushBatch {
  actions: SwitchVersionActions;
  sourceChanges: RxDBChange[];
  sourceChangesByLocalId: Map<number, RxDBChange[]>;
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

function buildCompactedPushEntries(localChanges: RxDBChange[], actions: SwitchVersionActions): CompactedPushEntry[] {
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
  const sourceChangesByLocalId = new Map<number, RxDBChange[]>();

  for (const entry of entries) {
    actions[entry.actionKind].set(entry.key, entry.action);
    for (const sourceChange of entry.sourceChanges) {
      sourceChanges.push(sourceChange);
      sourceChangesByLocalId.set(sourceChange.id, [sourceChange]);
    }
  }

  sourceChanges.sort((left, right) => left.id - right.id);
  return {
    actions,
    sourceChanges,
    sourceChangesByLocalId
  };
}

function getChangeIdMapping(
  mergeResult: RemoteMergeResult | number | void
): NonNullable<RemoteMergeResult['changeIdMapping']> {
  if (typeof mergeResult !== 'object' || mergeResult === null) return [];
  return mergeResult.changeIdMapping ?? [];
}

function mapRemoteIds(
  mapping: NonNullable<RemoteMergeResult['changeIdMapping']>,
  sourceChangesByLocalId: Map<number, RxDBChange[]>
): Array<{ change: RxDBChange; remoteId: number }> {
  const resolvedMappings = mapping.map(({ localId, remoteId }) => {
    const sourceChanges = sourceChangesByLocalId.get(localId);
    if (!sourceChanges) {
      throw new RxDBError(`Remote change mapping references unknown local change: ${localId}`);
    }
    return { remoteId, sourceChanges };
  });
  const remoteIdsByChange = new Map<RxDBChange, number>();

  for (const { remoteId, sourceChanges } of resolvedMappings) {
    for (const change of sourceChanges) {
      remoteIdsByChange.set(change, remoteId);
    }
  }

  return [...remoteIdsByChange].map(([change, remoteId]) => ({ change, remoteId }));
}

async function mergePushBatch(
  remoteAdapter: RxDBAdapterRemoteBase,
  branchId: string,
  batch: CompactedPushBatch
): Promise<Array<{ change: RxDBChange; remoteId: number }>> {
  const mergeResult = await remoteAdapter.mergeChanges(batch.actions, branchId, batch.sourceChanges);
  return mapRemoteIds(getChangeIdMapping(mergeResult), batch.sourceChangesByLocalId);
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
  readonly entries: CompactedPushEntry[];
  readonly localChanges: RxDBChange[];
  readonly repoSync: RxDBSync;
  readonly localAdapter: Awaited<ReturnType<VersionManager['getLocalRepositories']>>['adapter'];
  readonly remoteAdapter: RxDBAdapterRemoteBase;
  readonly branchId: string;
  readonly originalCount: number;
  readonly effectiveCount: number;
  readonly compacted: number;
  /** 各相位累积推送成功的条目数。 */
  pushed: number;
  /** 各相位累积拿到的远端 id，最终一并落库。 */
  readonly remoteIdsByChange: Map<RxDBChange, number>;
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
  vm: VersionManager,
  namespace: string,
  entity: string
): Promise<RepositoryPushPlan | { emptyResult: PushRepositoryResult }> {
  const rxdb = vm.rxdb;

  // 验证远端适配器
  const remoteAdapterName = rxdb.config.sync?.remote?.adapter;
  if (!remoteAdapterName) {
    throw new RxDBError('Remote adapter not configured.');
  }

  await vm.getRemoteRepositories(); // 确保远端已配置
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
  const branchIds = await getAncestorBranchIds(vm, branch.id);

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

  // 压缩变更
  const localActions: SwitchVersionActions = {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  };

  compactChanges(
    localChanges.map(c => ({
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
    localActions
  );

  const effectiveCount = localActions.inserts.size + localActions.updates.size + localActions.deletes.size;
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
  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();

  return {
    repository: { namespace, entity },
    entries: buildCompactedPushEntries(localChanges, localActions),
    localChanges,
    repoSync,
    localAdapter,
    remoteAdapter,
    branchId: branch.id,
    originalCount,
    effectiveCount,
    compacted,
    pushed: 0,
    remoteIdsByChange: new Map<RxDBChange, number>()
  };
}

/**
 * 阶段二：把计划里属于本相位的条目发给远端，**不落库**。
 *
 * 成功推送的条目累加进 `plan.pushed`，拿到的远端 id 累加进 `plan.remoteIdsByChange`，
 * 都留给 {@link commitRepositoryPush} 一次性提交。
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

  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batchEntries = entries.slice(offset, offset + batchSize);
    const batch = createCompactedPushBatch(batchEntries);

    try {
      const mappedChanges = await mergePushBatch(plan.remoteAdapter, plan.branchId, batch);
      for (const { change, remoteId } of mappedChanges) {
        plan.remoteIdsByChange.set(change, remoteId);
      }
      plan.pushed += batchEntries.length;
    } catch (error) {
      console.error(`Error pushing changes to remote for repository [${namespace}/${entity}]:`, error);
      plan.error = error instanceof Error ? error : new Error(String(error));
      return;
    }
  }
}

/**
 * 阶段三：全部相位跑完后，把远端 id 和水位线一次性落库。
 *
 * 只有一条变更都没失败才落库：部分成功就推进水位线会让没推上去的那些永远丢失。
 *
 * @internal
 */
async function commitRepositoryPush(plan: RepositoryPushPlan): Promise<PushRepositoryResult> {
  const { repository, localChanges, repoSync, localAdapter, remoteIdsByChange, effectiveCount } = plan;
  const { namespace, entity } = repository;
  let pushed = plan.pushed;
  let pushError = plan.error;
  let failed = effectiveCount - pushed;

  if (failed === 0) {
    // 使用 reduce 求最大值，避免 Math.max(...arr) 在超大数组上触发调用栈溢出
    const maxChangeId = localChanges.reduce((max, c) => (c.id > max ? c.id : max), localChanges[0].id);

    const previousRemoteIds = new Map([...remoteIdsByChange].map(([change]) => [change, change.remoteId]));
    const previousSyncState = {
      lastPushedChangeId: repoSync.lastPushedChangeId,
      lastPushedAt: repoSync.lastPushedAt,
      updatedAt: repoSync.updatedAt
    };
    const pushedAt = new Date();

    try {
      await localAdapter.transaction(async executor => {
        const changesToSave = [...remoteIdsByChange].map(([change, remoteId]) => {
          change.remoteId = remoteId;
          return change;
        });
        if (changesToSave.length > 0) {
          await executor.saveMany(changesToSave);
        }
        await executor.getRepository(RxDBSync).update(repoSync, {
          lastPushedChangeId: maxChangeId,
          lastPushedAt: pushedAt,
          updatedAt: pushedAt
        });
      });
    } catch (error) {
      for (const [change, remoteId] of previousRemoteIds) {
        change.remoteId = remoteId;
      }
      Object.assign(repoSync, previousSyncState);
      console.error(`Error saving push state for repository [${namespace}/${entity}]:`, error);
      pushError = error instanceof Error ? error : new Error(String(error));
      pushed = 0;
      failed = effectiveCount;
    }
  }

  return {
    repository,
    success: failed === 0,
    error: pushError,
    pushed,
    failed,
    compacted: plan.compacted,
    originalCount: plan.originalCount,
    failures: pushError ? [{ repository, error: pushError }] : []
  };
}

/**
 * 单仓库推送变更（内部实现）
 *
 * 不涉及跨仓顺序，三类动作一趟推完。
 *
 * @internal
 */
async function pushSingleRepository(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options: Required<PushRepositoryOptions>
): Promise<PushRepositoryResult> {
  const planned = await planRepositoryPush(vm, namespace, entity);
  if ('emptyResult' in planned) return planned.emptyResult;

  await pushPlanEntries(planned, ALL_ACTION_KINDS, options.batchSize);
  const result = await commitRepositoryPush(planned);
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
