/**
 * @fileoverview worktree 四个命令的事务内命令体（US-310）。
 *
 * @remarks
 * 全部跑在 `WorktreeManager.runEnabled()` 开的那一笔事务里：本模块不开事务、不读能力行、**不调切换**。
 * 切换由门面在事务提交之后发起——`switchBranch()` 自己开事务，嵌套进来会死锁（事务队列并发度 1）。
 *
 * 「当前 worktree」不存在任何一列里：`active` 一律按 `rxdb_branch.activated` 现算，
 * 与 `activation-state.ts` 的「没有第二份 active branch ID」同一条裁决。
 */

import { assertSingleActiveBranch, RxDBBranch, type EntityManager, type TransactionExecutor } from '@aiao/rxdb';
import { classifyBranchMaterialization } from '../working-tree/branch-materialization.js';
import { readWorktreeStateRow } from '../working-tree/capture-runtime.js';
import { WorktreeDirtyError } from '../working-tree/switch-branch-options.js';
import {
  WorktreeActiveError,
  WorktreeBranchNotFoundError,
  WorktreeBranchPinnedError,
  WorktreeLabelError,
  WorktreeNotFoundError
} from './worktree-errors.js';
import { createWorktreeRow, Worktree } from './worktree.entity.js';

/**
 * 一个 worktree 的公开视图（`listWorktrees()` / `createWorktree()` 的返回值）。
 *
 * @remarks
 * 不是实体实例：实体带着可写形态，而 worktree 行的每一次改动都必须走门面的门禁与事务。
 *
 * @public
 */
export interface WorktreeInfo {
  /** worktree id；`switchWorktree()` / `removeWorktree()` 的入参 */
  readonly id: string;
  /** 所钉分支 */
  readonly branchId: string;
  /** 显示名；`null` 时界面显示 {@link WorktreeInfo.branchId} */
  readonly label: string | null;
  /** 是不是当前 checkout；与 `rxdb_branch.activated` 同口径 */
  readonly active: boolean;
  /** 创建时间；写入时由适配器填充（PGlite 用库时钟，SQLite 族用客户端时钟） */
  readonly createdAt: Date;
}

/**
 * 把一行翻成公开视图
 *
 * @param row - worktree 行
 * @param active - 它钉住的分支是不是当前 active 分支
 * @returns 公开视图
 */
export const toWorktreeInfo = (row: Worktree, active: boolean): WorktreeInfo => ({
  id: row.id,
  branchId: row.branchId,
  label: row.label,
  active,
  createdAt: row.createdAt
});

/** 按一列等值取 worktree 行；`branchId` 与 `id` 两列上都至多一行。 */
const findWorktree = async (
  executor: TransactionExecutor,
  field: 'id' | 'branchId',
  value: string
): Promise<Worktree | undefined> => {
  const [row] = await executor.getRepository(Worktree).find({
    where: { combinator: 'and', rules: [{ field, operator: '=', value }] },
    limit: 1
  });
  return row;
};

/**
 * 按 id 取一行 worktree
 *
 * @param executor - 调用方那个事务的执行器
 * @param id - worktree id
 * @returns 那一行
 * @throws {@link WorktreeNotFoundError} 行不存在时
 */
export const readWorktreeRow = async (executor: TransactionExecutor, id: string): Promise<Worktree> => {
  const row = await findWorktree(executor, 'id', id);
  if (!row) throw new WorktreeNotFoundError(id);
  return row;
};

/**
 * 全部 worktree，按 `(createdAt, branchId)` 升序
 *
 * @param executor - 调用方那个事务的执行器
 * @returns 公开视图；零行是合法态
 *
 * @remarks
 * 第二排序键不是装饰：`createdAt` 由适配器在写入时填（SQLite 族取客户端时钟，PGlite 取库时钟），
 * 两行完全可能落在同一个时刻，只靠它排不出确定次序，界面上的列表会在两次读之间换位。
 * `branchId` 上有唯一索引，次序因此确定。
 */
export const readWorktreeList = async (executor: TransactionExecutor): Promise<WorktreeInfo[]> => {
  const active = await assertSingleActiveBranch(executor);
  const rows = await executor.getRepository(Worktree).find({
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'createdAt', sort: 'asc' },
      { field: 'branchId', sort: 'asc' }
    ]
  });
  return rows.map(row => toWorktreeInfo(row, row.branchId === active.id));
};

/**
 * 把一条分支钉成一个新 worktree（只落行，不切换）
 *
 * @param executor - 调用方那个事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 要钉的分支
 * @param label - 显示名；不传即不起名
 * @returns 落库后的那一行；`createdAt` 已由适配器在写入时填好
 * @throws {@link WorktreeLabelError} label 给了却是空白
 * @throws {@link WorktreeBranchNotFoundError} 分支不存在
 * @throws {@link WorktreeBranchPinnedError} 这条分支已经钉着一个 worktree
 *
 * @remarks
 * **唯一判据是「这条分支上有没有行」**，不问它是不是 active：单 checkout 模型没有第二个槽位，
 * 从分支菜单直接切过去、还没钉住的那条分支照样可以钉。
 *
 * 先读再插仍有并发窗口（另一条连接在两步之间插了同一分支），由 `idx_worktree_branch` 唯一索引兜住——
 * 败者炸的是约束错误，不会出现两行钉同一分支。
 *
 * label 原样落库、不 trim：显式给的值静默改写等于替用户改输入；只拒绝全空白的那一种。
 */
export const pinWorktree = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  branchId: string,
  label: string | undefined
): Promise<Worktree> => {
  if (label !== undefined && label.trim() === '') throw new WorktreeLabelError(label);
  const [branch] = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!branch) throw new WorktreeBranchNotFoundError(branchId);
  const pinned = await findWorktree(executor, 'branchId', branchId);
  if (pinned) throw new WorktreeBranchPinnedError(branchId, pinned.id);
  const row = createWorktreeRow(entityManager, branchId, label ?? null);
  // 不再按主键读回一遍：两个适配器的写路径都会在 INSERT 之后回查这一行、水合到同一个实例上，
  // `createdAt` 这类由写入填的列此刻已经在实例上了（`ensureBranchCommitRows` 同款）。
  const [saved] = await executor.saveMany([row]);
  return saved;
};

/**
 * 一条分支上的未提交条目数
 *
 * @remarks
 * 判据与切换守卫同一列（`WorkingTreeState.entryCount`），不扫条目表——两份判据迟早漂移。
 *
 * **metadata-only 的远端分支记 0**：它在本地从没有过工作树，也就没有状态行、不可能有未提交改动。
 * `createWorktree()` 切换阶段失败留下的那一行（钉在一条还没物化的远端分支上）因此删得掉。
 * 「是不是 metadata-only」由 {@link classifyBranchMaterialization} 按分支行判，与切换走同一条裁决；
 * 其余分支一律经 {@link readWorktreeStateRow} 读，缺行即抛——本地分支没有状态行是迁移没跑完或被
 * 外部删了行，按 0 条改动放行会把那条分支上可能存在的改动连同 worktree 一起悄悄丢开。
 */
const readEntryCount = async (executor: TransactionExecutor, branchId: string): Promise<number> => {
  const materialization = await classifyBranchMaterialization(executor, branchId);
  if (materialization.kind === 'metadata_only') return 0;
  const state = await readWorktreeStateRow(executor, branchId);
  return state.entryCount;
};

/**
 * 移除一个 worktree：只删这一行
 *
 * @param executor - 调用方那个事务的执行器
 * @param id - worktree id
 * @returns 删掉的那一行（调用方据此派发删除事件）
 * @throws {@link WorktreeNotFoundError} 行不存在
 * @throws {@link WorktreeActiveError} 它是当前所在的 worktree
 * @throws {@link WorktreeDirtyError} 它所钉的分支上还有未提交改动
 *
 * @remarks
 * 分支、它的未提交改动、它的提交图一概不动；删后这条分支回到「没钉住」，随时可以再钉。
 * 两道拒绝都照 `git worktree remove`：删掉当前 checkout 会让「我在哪个 worktree」没有答案；
 * 删掉有未提交改动的 worktree 虽不丢数据，但那些改动从此只能经分支菜单找回。
 */
export const unpinWorktree = async (executor: TransactionExecutor, id: string): Promise<Worktree> => {
  const row = await readWorktreeRow(executor, id);
  const active = await assertSingleActiveBranch(executor);
  if (row.branchId === active.id) throw new WorktreeActiveError(row.id, row.branchId);
  const entryCount = await readEntryCount(executor, row.branchId);
  if (entryCount > 0) throw new WorktreeDirtyError(row.branchId, entryCount);
  await executor.removeMany([row]);
  return row;
};

/**
 * 库里一个 worktree 都没有时，把当前 active 分支钉成主 worktree（只在首次启用时调用）
 *
 * @param executor - 启用那一笔事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @returns 新钉的那一行；表里已有行时返回 `null`，一行都不写
 *
 * @remarks
 * 新库建库时就有主 worktree（`createInitialRows`），升级上来、恰有一条 active 分支的库由 `0005-worktrees`
 * 补。落空的只有「零 active 分支的老库」：0005 跑的时候没有可钉的分支（R2），active 分支要到首次启用时
 * 才由启用迁移建出来。在同一笔启用事务里补上这一行，三种库启用之后的形状就相同了。
 *
 * 表里已有行就不动：新库在首次启用时已经有主 worktree，再钉一行会撞 `idx_worktree_branch`。
 */
export const ensureMainWorktree = async (
  executor: TransactionExecutor,
  entityManager: EntityManager
): Promise<Worktree | null> => {
  const [existing] = await executor.getRepository(Worktree).find({ where: { combinator: 'and', rules: [] }, limit: 1 });
  if (existing) return null;
  const active = await assertSingleActiveBranch(executor);
  const [saved] = await executor.saveMany([createWorktreeRow(entityManager, active.id, null)]);
  return saved;
};
