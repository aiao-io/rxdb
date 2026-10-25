/**
 * @fileoverview 提交视图（US-313 阶段 B）：把当前分支的数据往回推到一个可达提交。
 *
 * @remarks
 * v1 的 restore 不重写业务表，拿不到「那次提交刚完成时」的现成数据，只能从现在往回推：先把 active 分支的
 * 工作树条目整体反向（回到 HEAD），再从 HEAD 沿 restore 选定的可达路径往回，逐个提交反向应用它的变更单元。
 * 全部单元按时间编号，交给切分支同一份折叠（`get_switch_version_actions` 的逆向一支），叠到当前分支的快照上。
 *
 * 只动已跟踪实体：未跟踪的表（查询缓存、关闭变更日志的实体）没有单元，保持现值。
 * 可达性、兼容性预检与 restore 同一口径（`selectRestoreReplayPath` / `findFirstReplayIncompatibility`），
 * 拒绝原因也同名，调用方对两条入口写同一套分支。
 */

import type { RxDBChange, SwitchVersionActions, TransactionExecutor } from '@aiao/rxdb';
import { decodeRxDBChangeEntityId } from '@aiao/rxdb';
import { get_switch_version_actions } from '@aiao/rxdb-plugin-history';
import type { CommitChangeUnitContent } from '../commit/change-unit.js';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken } from '../working-tree/capture-runtime.js';
import { readActiveRestoreSession } from '../working-tree/restore-command.js';
import { findFirstReplayIncompatibility, selectRestoreReplayPath } from '../working-tree/restore-precheck.js';
import { WorkingTreeEntry } from '../working-tree/working-tree-entry.entity.js';
import { decodeWorkingTreePatch, type WorkingTreePatchCodecContext } from '../working-tree/working-tree-patch-codec.js';
import { WorktreeUnavailableError } from './worktree-errors.js';

/** 提交视图打得开时，往回推要走的路。 */
export interface WorktreeCommitViewPlan {
  /** 当前 active 分支 */
  readonly branchId: string;
  /** 要反向应用的提交，按重放顺序（HEAD 在前），不含目标提交自身 */
  readonly path: readonly string[];
}

/** 一个要反向应用的单元：提交里的变更单元，或工作树条目，解码之后同形。 */
type ReversibleUnit = Pick<
  CommitChangeUnitContent,
  'namespace' | 'entity' | 'entityId' | 'operation' | 'patch' | 'inversePatch'
>;

const CHANGE_TYPES = { insert: 'INSERT', update: 'UPDATE', delete: 'DELETE' } as const;

/**
 * 判提交视图打不打得开；打得开就交回往回推的路。
 *
 * @param executor - 主库事务的执行器
 * @param codec - 解析单元目标实体用的上下文
 * @param commitId - 目标提交
 * @returns 往回推的路
 * @throws {@link WorktreeUnavailableError} `restoring_working_tree`：有进行中的恢复会话；
 * `unreachable_target`：目标不在 HEAD 的可达父链上；`incompatible_schema`：路径上有本客户端认不出的实体
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
  const path = await selectRestoreReplayPath(executor, headCommitId, commitId);
  if (!path) {
    throw new WorktreeUnavailableError('unreachable_target', `提交 ${commitId} 不在分支 ${branchId} HEAD 的可达父链上`);
  }
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
  const units: ReversibleUnit[] = [];
  // 按时间先后编号：路径上最老的提交在前，提交内按 sequence，工作树条目最新。逆向折叠按编号从大到小撤销
  for (const commitId of [...plan.path].reverse()) {
    for (const row of await readChangeSetsOf(executor, commitId)) units.push(decodeCommitChangeSetUnit(codec, row));
  }
  for (const entry of await readEntriesOf(executor, plan.branchId)) units.push(decodeEntry(codec, entry));
  return get_switch_version_actions(units.map(asChange), false);
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

const decodeEntry = (codec: WorkingTreePatchCodecContext, entry: WorkingTreeEntry): ReversibleUnit => {
  const target = { namespace: entry.namespace, entity: entry.entity };
  return {
    namespace: entry.namespace,
    entity: entry.entity,
    entityId: entry.entityId,
    operation: entry.operation,
    patch: decodeWorkingTreePatch(codec, target, entry.patch),
    inversePatch: decodeWorkingTreePatch(codec, target, entry.inversePatch)
  };
};

/** 折叠只读编号、类型、身份与两份补丁；其余列（分支、回滚标记）在这条路上没有意义。 */
const asChange = (unit: ReversibleUnit, index: number): RxDBChange =>
  ({
    id: index + 1,
    type: CHANGE_TYPES[unit.operation],
    namespace: unit.namespace,
    entity: unit.entity,
    entityId: decodeRxDBChangeEntityId(unit.entityId),
    patch: unit.patch,
    inversePatch: unit.inversePatch
  }) as unknown as RxDBChange;
