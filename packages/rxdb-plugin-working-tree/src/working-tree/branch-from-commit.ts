/**
 * @fileoverview 从提交建分支（US-314 阶段 A）：判一个提交能不能当分叉点，能就在它那里建一条分支。
 *
 * @remarks
 * 新分支的 HEAD 就是那个提交、工作树为空，数据就是那次 `commit()` 刚完成时的业务表：分叉点在提交时记下
 * （`commit/commit-fork-point.ts`），切过去由历史插件沿谱系折叠出来。只建不切，切换由调用方接着调 `switchBranch()`。
 *
 * 判定与 restore、提交视图同一口径：目标必须在当前分支 HEAD 的可达父链上（`selectRestoreReplayPath`），
 * 提交图损坏先抛。被拒的三种成因走返回值，与 `restore()` 一样不是崩溃。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { RxDBBranch, RxDBError } from '@aiao/rxdb';
import type { CommitForkPoint } from '../commit/commit-fork-point.entity.js';
import { isForkPointLineageRewritten, readCommitForkPoint } from '../commit/commit-fork-point.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken } from './capture-runtime.js';
import { selectRestoreReplayPath } from './restore-precheck.js';

/**
 * 一个提交不能拿来建分支的成因
 *
 * @remarks
 * - `unreachable_target`：不在当前分支 HEAD 的可达父链上，与 restore 同名同义；
 * - `fork_point_unknown`：这个提交没有记下分叉点——分叉点表出现之前的提交，或 metadata-only 分支首次物化写下的基线；
 * - `history_rewritten`：提交之后有过撤销或重做，改动了新分支要继承的那段变更日志，切过去读到的已经不是那次提交时的数据。
 *
 * @public
 */
export type WorkingTreeBranchFromCommitRejection = 'unreachable_target' | 'fork_point_unknown' | 'history_rewritten';

/**
 * {@link WorkingTreeManager.checkBranchFromCommit} 的结果
 *
 * @public
 */
export type WorkingTreeBranchFromCommitCheck =
  | {
      /** 判别位：能拿来建分支 */
      readonly ok: true;
    }
  | {
      /** 判别位：不能拿来建分支 */
      readonly ok: false;
      /** 不能建的成因 */
      readonly reason: WorkingTreeBranchFromCommitRejection;
    };

/**
 * {@link WorkingTreeManager.createBranchFromCommit} 的结果
 *
 * @public
 */
export type WorkingTreeCreateBranchFromCommitResult =
  | {
      /** 判别位：建好了 */
      readonly ok: true;
      /** 刚建好的分支；没有切过去 */
      readonly branch: RxDBBranch;
    }
  | {
      /** 判别位：没建，一行都没写 */
      readonly ok: false;
      /** 没建的成因 */
      readonly reason: WorkingTreeBranchFromCommitRejection;
    };

/** 判定通过时交回的分叉点；被拒时同 {@link WorkingTreeBranchFromCommitCheck}。 */
type BranchFromCommitPlan =
  | { readonly ok: true; readonly forkPoint: CommitForkPoint }
  | { readonly ok: false; readonly reason: WorkingTreeBranchFromCommitRejection };

/**
 * 判一个提交能不能拿来建分支。
 *
 * @param executor - 受管事务的执行器
 * @param commitId - 目标提交
 * @returns 能建时交回它的分叉点，否则交回成因
 * @throws CommitGraphCorruptedError 当前分支的提交图已损坏（FR-051）
 *
 * @remarks
 * 不看当前分支的工作树与恢复会话：新分支只继承那个提交，当前分支一格都不动。
 */
export const planBranchFromCommit = async (
  executor: TransactionExecutor,
  commitId: string
): Promise<BranchFromCommitPlan> => {
  const { branchId } = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, branchId);
  const { headCommitId } = await readCommitBranchRef(executor, branchId);
  if (!(await selectRestoreReplayPath(executor, headCommitId, commitId))) {
    return { ok: false, reason: 'unreachable_target' };
  }
  const forkPoint = await readCommitForkPoint(executor, commitId);
  if (!forkPoint) return { ok: false, reason: 'fork_point_unknown' };
  if (await isForkPointLineageRewritten(executor, forkPoint)) return { ok: false, reason: 'history_rewritten' };
  return { ok: true, forkPoint };
};

/**
 * 本地已有同名分支就抛，文案与 `createBranch()` 相同。
 *
 * @param executor - 受管事务的执行器
 * @param branchId - 要建的分支 id
 * @throws {@link RxDBError} 本地已有同名分支时
 */
export const assertBranchIdFreeLocally = async (executor: TransactionExecutor, branchId: string): Promise<void> => {
  const existing = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (existing.length > 0) throw new RxDBError(`Branch id (${branchId}) already exists`);
};
