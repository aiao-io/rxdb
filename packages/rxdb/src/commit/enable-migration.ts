/**
 * @fileoverview 显式启用提交能力时的一次性初始化迁移（FR-021/049、R11）
 *
 * @remarks
 * **它不是 `system/migrations/0004-working-tree-commits.ts`。** 那条建表迁移在
 * `enabled = false` 下就已经跑完（data-model.md §8），库里每个分支都已经有一行
 * `headCommitId === null` 的空 ref。这里做的是 `enable()` 之后的另一件事：给每条
 * **本地**分支补上它的根节点，让后续的 `commit()` 有父可挂。两件事同名叫「迁移」，
 * 做的事完全不同。
 *
 * **「为每个分支」不是「为激活分支」。** 单分支库上两种写法行为一模一样，要到用户
 * 切到第二个分支那天才炸：那时库已经 `enabled = true`，而那条分支的 ref 还是空 HEAD，
 * `commit()` 会往一个没有根的分支上挂节点。
 *
 * **metadata-only 远端分支跳过，且不因此判失败（FR-049）。** 本地根本没有它的完整状态，
 * 提前伪造一个空 HEAD 等于宣称「这个远端分支在本地是空的」；它真正的首次物化归 US-308，
 * 那时会发现自己已经有根了，只能覆盖或放弃。「没有 ref」与「ref 的 HEAD 为空」必须可区分。
 *
 * **全有或全无。** 任一本地分支不可物化就整体失败，不留部分启用状态。所以全部判定
 * （父链自洽 + 变更链无缺口）在**第一次写之前**跑完：逐分支边判边写的形态会在第三条分支上
 * 炸掉时留下前两条的 baseline，重试时它们被当成「已初始化」跳过，库永久停在半启用且无任何报错。
 * 本函数不自己开事务——回滚由调用方的事务边界负责，这里只保证「炸之前没写过东西」。
 *
 * **可物化判定复用既有分支物化路径，不另写第二套重放引擎（R11）。** 判据是既有
 * `switchBranch` 的那两个符号：{@link find_branch_path_to_root} 回答「父链自不自洽」，
 * {@link find_switch_branch_step} 回答「从当前库状态走到这条分支要跨哪些变更区间」。
 * 另写一套简化遍历的代价不是重复代码，是迁移期与运行期对同一个库给出两种答案：
 * 迁移放行了一条 `switchBranch` 实际走不通的分支。
 *
 * **旧 change 一行不删。** undo/redo 与 `restoreEntity` 仍然靠 `rxdb_change`（FR-018/019）；
 * 「既然有了 commit 历史旧 change 就是冗余」是很自然的念头，但删掉等于把既有能力换成新能力。
 * 本模块只读 `rxdb_branch` / `rxdb_change`，只写 commit 侧的表。
 */

import type { EntityManager } from '../entity/entity-manager.js';
import type { IRepository } from '../repository/repository.interface.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import type { SwitchBranchStep } from '../version/find-switch-branch-step.js';
import { find_branch_path_to_root, find_switch_branch_step } from '../version/find-switch-branch-step.js';
import { get_branch_max_change } from '../version/switch-branch-actions.js';
import { CommitErrorCode } from './commit-error-codes.js';
import { readCommitBranchRef } from './list-commits.js';
import { writeCommit } from './write-commit.js';

/** 一条本地分支物化不了的成因。 */
export type BranchNotMaterializableReason =
  /** 分支父链成环或指向一条不存在的父分支 */
  | 'corrupt_branch_history'
  /** 走到该分支所需的某条 `rxdb_change` 已经不在库里 */
  | 'missing_change';

/**
 * 某条**本地**分支无法沿 `rxdb_change` 链无缺口物化，整条迁移失败（FR-049）。
 *
 * @remarks
 * 携带的三个值都是身份或枚举：分支 id、成因、一句人读的定位信息。**不带** patch 或
 * 任何变更内容——`errorSurfaceOf` 会把错误的自有属性整体序列化，patch 是明文，
 * 进日志等于把加密列的明文写进了日志（FR-038）。
 *
 * metadata-only 远端分支**不**走本错误：它此时压根不参与判定，首次物化归 US-308，
 * 失败码是 {@link CommitErrorCode.branch_not_materialized}。
 */
export class BranchNotMaterializableError extends RxDBError {
  /** 稳定错误码，恒为 {@link CommitErrorCode.branch_not_materializable} */
  readonly code: CommitErrorCode = CommitErrorCode.branch_not_materializable;

  constructor(
    /** 物化不了的那条本地分支 */
    readonly branchId: string,
    /** 见 {@link BranchNotMaterializableReason} */
    readonly reason: BranchNotMaterializableReason,
    /** 一句定位信息：成环的位置，或缺失的变更 id */
    readonly detail: string
  ) {
    super(`Branch '${branchId}' cannot be fully materialized (${reason}): ${detail}`);
    this.name = 'BranchNotMaterializableError';
    Object.setPrototypeOf(this, BranchNotMaterializableError.prototype);
  }
}

/** {@link runEnableMigration} 的入参。 */
export interface RunEnableMigrationOptions {
  /**
   * 本次 `enable()` 的操作 id，用于幂等
   *
   * @remarks
   * 全部分支共用同一个值是安全的：真正的幂等键由它与分支各自的 `generation` 合成
   * （见 `deriveCommitOperationId`），分支不同则键不同。
   */
  readonly operationId: string;
}

/** {@link runEnableMigration} 的返回。 */
export interface EnableMigrationResult {
  /** 本次新建了根节点的分支：分支 id → baseline 的 commit id */
  readonly baselineCommitIds: ReadonlyMap<string, string>;

  /** 跳过的 metadata-only 远端分支，按库里的顺序 */
  readonly skippedBranchIds: readonly string[];

  /** 本来就已经有根、这次什么都没做的本地分支；重复 `enable()` 时全部分支都落在这里 */
  readonly alreadyInitializedBranchIds: readonly string[];
}

/** 走完一遍判定所需的上下文，避免逐分支重算「当前库停在哪」。 */
interface MaterializationContext {
  /** 读 `rxdb_change` 用 */
  readonly changeRepository: IRepository<typeof RxDBChange>;

  /** 全量分支，**含远端**：父链要在完整集合上解析 */
  readonly branches: readonly RxDBBranch[];

  /** 当前激活分支，即重放的起点 */
  readonly activeBranch: RxDBBranch;

  /** 起点分支的 tip 变更 id；该分支没有自有变更时为 `null`，由步骤计算退回分叉点 */
  readonly activeTipChangeId: number | null;
}

/**
 * 读全量分支。
 *
 * @param executor - 当前事务执行器
 * @returns 库里的全部分支行
 *
 * @remarks
 * **不下推任何过滤。** 远端分支虽然不建 baseline，却可能是某条本地分支的父节点；
 * 在 WHERE 里把它们滤掉，父链会在那里断开，于是一条健康的本地分支被判成父链损坏。
 */
const readAllBranches = async (executor: TransactionExecutor): Promise<RxDBBranch[]> =>
  executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });

/**
 * 检查一条分支的父链自洽。
 *
 * @param branch - 待检查的本地分支
 * @param branchMap - 分支 id → 分支，必须是全量集合
 * @throws {@link BranchNotMaterializableError} 父链成环或指向不存在的父分支时
 *
 * @remarks
 * 必须**显式**调一次，不能指望 {@link find_switch_branch_step} 顺带检查：那个函数在
 * 「两端变更 id 相同」时直接返回空步骤，根本走不到构建父链那一步。一个父链成环、
 * 但两端都还停在根上的库，正是这样从缝里漏过去的。
 */
const assertBranchHistorySound = (branch: RxDBBranch, branchMap: ReadonlyMap<string, RxDBBranch>): void => {
  try {
    find_branch_path_to_root(branch, branchMap);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new BranchNotMaterializableError(branch.id, 'corrupt_branch_history', detail);
  }
};

/**
 * 收集一段切换步骤触到的全部变更 id。
 *
 * @param steps - {@link find_switch_branch_step} 的结果
 * @returns 去重后的变更 id
 *
 * @remarks
 * 0 表示「根」而不是某条变更（见 `forkPointOf`），所以不进集合——去库里找一条 id 为 0
 * 的变更，会把每一条从根长出来的分支都判成断链。
 */
const endpointsOf = (steps: readonly SwitchBranchStep[]): number[] => {
  const ids = new Set<number>();
  for (const step of steps) {
    if (step.fromChangeId > 0) ids.add(step.fromChangeId);
    if (step.toChangeId > 0) ids.add(step.toChangeId);
  }
  return [...ids];
};

/**
 * 检查从当前库状态能无缺口走到某条分支。
 *
 * @param context - 见 {@link MaterializationContext}
 * @param branch - 待检查的本地分支
 * @throws {@link BranchNotMaterializableError} 路径上某个端点变更已不在库里时
 *
 * @remarks
 * 端点查询**按变更 id 全局做，不按 `step.branch.id` 收窄**。变更 id 在各分支间统一递增，
 * 一条分支的分叉点变更常常挂在**父分支**名下；按步骤所属分支去查，会把一条完全健康的
 * 子分支判成断链。
 *
 * 只查区间端点、不逐条枚举区间内的变更：端点在库里就意味着这段区间没有被整体清理掉，
 * 而逐条枚举意味着把十万条变更读进内存只为了确认它们存在。
 */
const assertBranchReplayable = async (context: MaterializationContext, branch: RxDBBranch): Promise<void> => {
  const branchTip = await get_branch_max_change(context.changeRepository, branch.id);
  const steps = find_switch_branch_step({
    branches: [...context.branches],
    currentBranch: context.activeBranch,
    currentChangeId: context.activeTipChangeId,
    nextBranch: branch,
    nextChangeId: branchTip ? branchTip.id : null
  });

  const endpoints = endpointsOf(steps);
  if (endpoints.length === 0) return;

  const found = await context.changeRepository.find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: endpoints }] }
  });
  const present = new Set(found.map(change => change.id));
  const missing = endpoints.find(id => !present.has(id));
  if (missing !== undefined) {
    throw new BranchNotMaterializableError(
      branch.id,
      'missing_change',
      `change '${missing}' is no longer in rxdb_change`
    );
  }
};

/**
 * 给每条本地分支补根节点。
 *
 * @param executor - 当前事务执行器
 * @param entityManager - 构造实体行用
 * @param localBranches - 已经全部通过物化判定的本地分支
 * @param operationId - 见 {@link RunEnableMigrationOptions.operationId}
 * @returns 新建的 baseline 与被跳过的已初始化分支
 * @throws {@link RxDBError} HEAD CAS 落空时——那说明有别的写入正在推进同一条分支
 *
 * @remarks
 * 走 {@link writeCommit} 而不是另写一条「迁移专用」的 UPDATE：HEAD 只能有一条推进路径，
 * 第二条路上的 CAS 条件（`generation` / `status`）会被悄悄放宽，而放宽之后没有任何测试会红。
 *
 * 「已经有根」有两种表现，两种都不能造出第二个根：ref 的 `headCommitId` 非空是显式的一种；
 * 另一种由 `writeCommit` 自己的幂等键命中，返回 `reused`——重复 `enable()` 走的就是它。
 */
const writeBaselines = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  localBranches: readonly RxDBBranch[],
  operationId: string
): Promise<{ baselineCommitIds: Map<string, string>; alreadyInitializedBranchIds: string[] }> => {
  const baselineCommitIds = new Map<string, string>();
  const alreadyInitializedBranchIds: string[] = [];

  for (const branch of localBranches) {
    const ref = await readCommitBranchRef(executor, branch.id);
    if (ref.headCommitId !== null) {
      alreadyInitializedBranchIds.push(branch.id);
      continue;
    }
    const outcome = await writeCommit(executor, entityManager, {
      branchId: branch.id,
      branchGeneration: ref.generation,
      expectedHeadRevision: ref.headRevision,
      kind: 'baseline',
      message: null,
      author: null,
      operationId,
      units: []
    });
    if (outcome.status === 'head_revision_conflict') {
      throw new RxDBError(
        `Commit graph initialization lost the HEAD CAS on branch '${branch.id}' ` +
          `(expected revision ${outcome.expectedHeadRevision}). The whole migration must roll back and be retried.`
      );
    }
    if (outcome.status === 'committed') baselineCommitIds.set(branch.id, outcome.commit.id);
    else alreadyInitializedBranchIds.push(branch.id);
  }

  return { baselineCommitIds, alreadyInitializedBranchIds };
};

/**
 * 启用提交能力后的一次性初始化：给每条本地分支补上根节点（FR-021/049）。
 *
 * @param executor - 调用方**自己那个写事务**的执行器；本函数不开事务，失败由调用方回滚
 * @param entityManager - 构造实体行用
 * @param options - 见 {@link RunEnableMigrationOptions}
 * @returns 见 {@link EnableMigrationResult}
 * @throws {@link BranchNotMaterializableError} 任一本地分支物化不了时——此时一行都没写
 * @throws {@link RxDBError} 库里没有激活分支，或 HEAD CAS 落空时
 *
 * @remarks
 * 三趟，顺序不可换：先把全部本地分支的父链验一遍，再把全部本地分支的变更链验一遍，
 * 最后才开始写。把判定和写入揉进同一个循环，第三条分支炸掉时前两条的 baseline 已经落库。
 *
 * 重复调用是幂等的（FR-037）：全部分支都会落进
 * {@link EnableMigrationResult.alreadyInitializedBranchIds}，`baselineCommitIds` 为空，
 * 一条语句都不发。
 */
export const runEnableMigration = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  options: RunEnableMigrationOptions
): Promise<EnableMigrationResult> => {
  const branches = await readAllBranches(executor);
  const activeBranch = branches.find(branch => branch.activated);
  if (!activeBranch) {
    throw new RxDBError(
      'Cannot initialize the commit graph: no branch is activated. ' +
        'Materializability is judged by replaying from the current database state, which needs a starting point.'
    );
  }

  const localBranches = branches.filter(branch => branch.local);
  const skippedBranchIds = branches.filter(branch => !branch.local).map(branch => branch.id);
  const branchMap = new Map(branches.map(branch => [branch.id, branch]));
  for (const branch of localBranches) assertBranchHistorySound(branch, branchMap);

  const changeRepository = executor.getRepository(RxDBChange);
  const activeTip = await get_branch_max_change(changeRepository, activeBranch.id);
  const context: MaterializationContext = {
    changeRepository,
    branches,
    activeBranch,
    activeTipChangeId: activeTip ? activeTip.id : null
  };
  for (const branch of localBranches) await assertBranchReplayable(context, branch);

  const written = await writeBaselines(executor, entityManager, localBranches, options.operationId);
  return {
    baselineCommitIds: written.baselineCommitIds,
    skippedBranchIds,
    alreadyInitializedBranchIds: written.alreadyInitializedBranchIds
  };
};
