/**
 * @fileoverview 提交的分叉点：提交时记下，从提交建分支时读回并核对（US-314 阶段 A）
 *
 * @remarks
 * 从提交建分支，新分支就是变更日志上的一条线：父分支是提交所在的分支，分叉点是提交那一刻那条分支停下的位置。
 * 切过去时数据由历史插件沿谱系折叠出来（`compute_switch_branch_actions`），所以「切过去读到的」等于
 * 「提交刚完成时的」，要求这段谱系的回滚状态从那以后没变过——撤销能改动已经提交的变更（FR-018），
 * 改过就只能拒绝，否则新分支会带着一份与那个提交对不上的数据。
 */

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { RxDBBranch, RxDBChange, RxDBError } from '@aiao/rxdb';
import { find_branch_path_to_root, forkPointOf, get_branch_max_change } from '@aiao/rxdb-plugin-history';
import { CommitForkPoint } from './commit-fork-point.entity.js';

/** 谱系上不晚于分叉点那一段的回滚状态，见 {@link CommitForkPoint.revertedCount}。 */
interface LineageRevertState {
  readonly revertedCount: number;
  readonly maxRevertChangeId: number | null;
}

/** 谱系上的一段：一条分支，与新分支从这一段继承的最大变更 id（含）。 */
interface LineageSegment {
  readonly branchId: string;
  readonly upTo: number;
}

/**
 * 从分叉点往根走，列出新分支会继承的每一段。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 分叉点所在的分支
 * @param changeId - 分叉点；`null` 是停在这条分支自己的分叉点上
 * @returns 继承范围非空的那几段，分叉点所在的分支在前
 * @throws {@link RxDBError} 分叉点所在的分支不在库里，或父链断裂、成环时
 *
 * @remarks
 * 第一段到分叉点为止，往上每一段到下一级分支的分叉点为止，与切分支同一份父链遍历、同一个「分叉于根记 0」的约定，
 * 取全量分支集合——那个遍历把断链当作完整性错误，传进去的集合必须是全量。
 */
const lineageSegmentsOf = async (
  executor: TransactionExecutor,
  branchId: string,
  changeId: number | null
): Promise<LineageSegment[]> => {
  const branches = await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });
  const branchMap = new Map(branches.map(branch => [branch.id, branch]));
  const branch = branchMap.get(branchId);
  if (!branch) {
    throw new RxDBError(`分叉点所在的分支 ${branchId} 不在库里：分叉点只会落在仍有后代或就是当前分支的分支上`);
  }
  const path = find_branch_path_to_root(branch, branchMap);
  return path
    .map((segment, index) => ({
      branchId: segment.id,
      upTo: index === 0 ? (changeId ?? 0) : forkPointOf(path[index - 1])
    }))
    .filter(segment => segment.upTo > 0);
};

/**
 * 读谱系上不晚于分叉点那一段的回滚状态。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 分叉点所在的分支
 * @param changeId - 分叉点
 * @returns 处于回滚状态的条数与最大回滚号
 *
 * @remarks
 * 走事务内的仓库，不发原始语句：提交路径上不许有指名变更日志的原始 SQL（FR-018 的守卫就是按语句文本查的），
 * 这里只读。一次计数加一次「按回滚号倒序取一条」，不把那几段的回滚行整批读回来。
 */
const readLineageRevertState = async (
  executor: TransactionExecutor,
  branchId: string,
  changeId: number | null
): Promise<LineageRevertState> => {
  const segments = await lineageSegmentsOf(executor, branchId, changeId);
  if (segments.length === 0) return { revertedCount: 0, maxRevertChangeId: null };

  const where = {
    combinator: 'and' as const,
    rules: [
      { field: 'revertChangeId' as const, operator: '!=' as const, value: null },
      {
        combinator: 'or' as const,
        rules: segments.map(segment => ({
          combinator: 'and' as const,
          rules: [
            { field: 'branchId' as const, operator: '=' as const, value: segment.branchId },
            { field: 'id' as const, operator: '<=' as const, value: segment.upTo }
          ]
        }))
      }
    ]
  };
  const changes = executor.getRepository(RxDBChange);
  const revertedCount = await changes.count({ where });
  const [latest] = await changes.find({ where, orderBy: [{ field: 'revertChangeId', sort: 'desc' }], limit: 1 });
  return { revertedCount, maxRevertChangeId: latest?.revertChangeId ?? null };
};

/**
 * 在提交落库的同一事务里记下它的分叉点。
 *
 * @param executor - 提交那笔事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param commitId - 刚写下的提交
 * @param branchId - 提交所在的分支（ref 的分支）
 *
 * @remarks
 * 分叉点取「这条分支未回滚的最大一条自有变更」，与 `switchBranch` 判「一条分支停在哪」同一个函数：
 * 另写一条同义查询，迟早会在「回滚标记算不算」上与切换路径分叉。
 */
export const recordCommitForkPoint = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  commitId: string,
  branchId: string
): Promise<void> => {
  const tip = await get_branch_max_change(executor.getRepository(RxDBChange), branchId);
  const changeId = tip ? tip.id : null;
  const state = await readLineageRevertState(executor, branchId, changeId);
  const row = entityManager.instantiate(CommitForkPoint);
  row.id = commitId;
  row.branchId = branchId;
  row.changeId = changeId;
  row.revertedCount = state.revertedCount;
  row.maxRevertChangeId = state.maxRevertChangeId;
  await executor.saveMany([row]);
};

/**
 * 读一个提交的分叉点。
 *
 * @param executor - 当前事务执行器
 * @param commitId - 提交 id
 * @returns 分叉点；这个提交没有记录时为 `undefined`
 */
export const readCommitForkPoint = async (
  executor: TransactionExecutor,
  commitId: string
): Promise<CommitForkPoint | undefined> => {
  const [row] = await executor.getRepository(CommitForkPoint).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: commitId }] },
    limit: 1
  });
  return row;
};

/**
 * 提交之后，撤销 / 重做有没有改过新分支要继承的那段谱系。
 *
 * @param executor - 当前事务执行器
 * @param forkPoint - 提交记下的分叉点
 * @returns 改过时为 `true`
 *
 * @remarks
 * 只认得出建分支**之前**的改动。建完之后再在父分支上撤销分叉点之前的变更，新分支的数据跟着变，
 * 这与今天任何一条子分支一样（FR-017），不在这里管。
 */
export const isForkPointLineageRewritten = async (
  executor: TransactionExecutor,
  forkPoint: CommitForkPoint
): Promise<boolean> => {
  const now = await readLineageRevertState(executor, forkPoint.branchId, forkPoint.changeId);
  return now.revertedCount !== forkPoint.revertedCount || now.maxRevertChangeId !== forkPoint.maxRevertChangeId;
};
