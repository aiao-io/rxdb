/**
 * @fileoverview 提交视图（US-313 阶段 B）：把当前分支的数据往回推到一个可达提交。
 *
 * @remarks
 * 视图要的是「那次提交刚完成时」的数据，而业务表里只有现在的：只能从现在往回推——先把 active 分支的
 * 工作树条目整体反向（回到 HEAD），再从 HEAD 沿 restore 选定的可达路径往回，逐个提交反向应用它的变更单元。
 * 全部单元按时间编号，交给切分支同一份折叠（`get_switch_version_actions` 的逆向一支），叠到当前分支的快照上。
 * US-317 之后 restore 也把目标的数据写进业务表，但那是一次写；视图不动主库，照旧只读着往回推。
 *
 * 只动已跟踪实体：未跟踪的表（查询缓存、关闭变更日志的实体）没有单元，保持现值。
 * 可达性、兼容性预检与 restore 同一口径（`resolveFirstParentReplayPath` / `findFirstReplayIncompatibility`），
 * 拒绝原因也同名，调用方对两条入口写同一套分支。条目的解码与编号与 discard 的回写共用
 * `working-tree/projection-actions.ts` 那一份。
 */

import type { SwitchVersionActions, TransactionExecutor } from '@aiao/rxdb';
import { get_switch_version_actions } from '@aiao/rxdb-plugin-history';
import { resolveFirstParentReplayPath } from '../commit/commit-ancestry.js';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken } from '../working-tree/capture-runtime.js';
import {
  decodeWorkingTreeEntryUnit,
  toProjectionChange,
  type WorkingTreeProjectionUnit
} from '../working-tree/projection-actions.js';
import { readActiveRestoreSession } from '../working-tree/restore-command.js';
import { findFirstReplayIncompatibility } from '../working-tree/restore-precheck.js';
import { WorkingTreeEntry } from '../working-tree/working-tree-entry.entity.js';
import type { WorkingTreePatchCodecContext } from '../working-tree/working-tree-patch-codec.js';
import { WorktreeUnavailableError } from './worktree-errors.js';

/** 提交视图打得开时，往回推要走的路。 */
export interface WorktreeCommitViewPlan {
  /** 当前 active 分支 */
  readonly branchId: string;
  /** 要反向应用的提交，按重放顺序（HEAD 在前），不含目标提交自身 */
  readonly path: readonly string[];
}

/**
 * 判提交视图打不打得开；打得开就交回往回推的路。
 *
 * @param executor - 主库事务的执行器
 * @param codec - 解析单元目标实体用的上下文
 * @param commitId - 目标提交
 * @returns 往回推的路
 * @throws {@link WorktreeUnavailableError} `restoring_working_tree`：有进行中的恢复会话；
 * `unreachable_target`：目标不在 HEAD 的可达父链上；`side_branch_target`：目标只在合并进来的侧枝上，沿第一父链推不到
 * （US-316）；`incompatible_schema`：路径上有本客户端认不出的实体
 * @throws CommitGraphCorruptedError 当前分支的提交图已损坏
 */
export const planCommitView = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  commitId: string
): Promise<WorktreeCommitViewPlan> => {
  const { branchId } = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, branchId);
  if (await readActiveRestoreSession(executor, branchId)) {
    throw new WorktreeUnavailableError(
      'restoring_working_tree',
      `分支 ${branchId} 上有进行中的恢复：先提交或丢弃它恢复出来的变更`
    );
  }
  const { headCommitId } = await readCommitBranchRef(executor, branchId);
  const resolved = await resolveFirstParentReplayPath(executor, headCommitId, commitId);
  if (resolved.kind === 'unreachable') {
    throw new WorktreeUnavailableError('unreachable_target', `提交 ${commitId} 不在分支 ${branchId} HEAD 的可达父链上`);
  }
  if (resolved.kind === 'side_branch') {
    throw new WorktreeUnavailableError(
      'side_branch_target',
      `提交 ${commitId} 只在分支 ${branchId} 合并进来的侧枝上，沿第一父链往回推不到它`
    );
  }
  const { path } = resolved;
  const incompatible = await findFirstReplayIncompatibility(executor, codec, path);
  if (incompatible) {
    throw new WorktreeUnavailableError(
      'incompatible_schema',
      `提交 ${incompatible.commitId} 里有本客户端认不出的实体 ${incompatible.namespace}:${incompatible.entity}`
    );
  }
  return { branchId, path };
};

/**
 * 从当前数据退回到目标提交要落的增量。
 *
 * @param executor - 主库事务的执行器
 * @param codec - 解码单元用的上下文
 * @param plan - {@link planCommitView} 交回的路；要在同一个事务里重新算过
 * @returns 叠在当前分支快照上的增量；补丁是解码后的形态，加密列保持信封
 */
export const commitViewActions = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  plan: WorktreeCommitViewPlan
): Promise<SwitchVersionActions> => {
  const units: WorkingTreeProjectionUnit[] = [];
  // 按时间先后编号：路径上最老的提交在前，提交内按 sequence，工作树条目最新。逆向折叠按编号从大到小撤销
  for (const commitId of [...plan.path].reverse()) {
    for (const row of await readChangeSetsOf(executor, commitId)) units.push(decodeCommitChangeSetUnit(codec, row));
  }
  for (const entry of await readEntriesOf(executor, plan.branchId))
    units.push(decodeWorkingTreeEntryUnit(codec, entry));
  return get_switch_version_actions(units.map(toProjectionChange), false);
};

/** 一个提交的全部变更单元，按 `sequence` 升序；排序在 JS 侧做，不依赖后端的返回顺序。 */
const readChangeSetsOf = async (executor: TransactionExecutor, commitId: string): Promise<CommitChangeSet[]> => {
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  return [...rows].sort((left, right) => left.sequence - right.sequence);
};

/** 一条分支的工作树条目：每个身份至多一条，撤销与顺序无关。 */
const readEntriesOf = (executor: TransactionExecutor, branchId: string): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] }
  });
