/**
 * @fileoverview 一条分支在提交侧的两行伴生记录（data-model.md §2.2/§2.5）
 *
 * @remarks
 * 一条 `rxdb_branch` 永远配一行 `CommitBranchRef` 与一行 `WorkingTreeState`。这个「永远」有
 * **三条**入口要满足，缺一处就会出现一条读得到、却在 `readCommitBranchRef()` 上抛错的分支：
 *
 * 1. 新库建表时随初始行一起写（`RxDB.ts` 的 `createTables`）；
 * 2. 既有库升级时由 `0004-working-tree-commits` 补写；
 * 3. **运行期 `createBranch()` 新建分支时**（`version/create-branch.ts`）。
 *
 * 前两条同源，第三条曾经漏掉——结果是 `createBranch()` 之后 `enable()` 永久失败，而
 * `working-tree-facade.ts` 承诺的「再调一次 `enable()` 就能补根」对这类分支从不成立。
 *
 * 所以这两行只此一处生成。`0004` 的初始行工厂另有两件事要做（发放整批代际、写两行单例），
 * 不能反过来给建分支复用；能共用的只有「一条分支长什么样」这一段，也正是这里。
 */

import type { EntityManager } from '../entity/entity-manager.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { allocateBranchGeneration } from '../working-tree/activation-state.js';
import { WorkingTreeState } from '../working-tree/working-tree-state.entity.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';

/**
 * 造出一条分支的 ref 与工作树状态行（均未落库）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 分支 id；两行的主键都与它逐字相同
 * @param generation - 本条分支的不可变代际，由 `WorkingTreeActivationState.branchGenerationSeq` 发放
 * @returns 未落库的两行，调用方负责在**一个**事务里写下去
 *
 * @remarks
 * `headCommitId = null` 是「还没有根」，**不是**「空历史」：`enable()` 会据此给它补 baseline。
 * 提前伪造一个根等于宣称这条分支已经初始化过，`enable()` 就会跳过它。
 *
 * 代际由调用方发放而不是在这里自增：发放要改 `WorkingTreeActivationState` 那一行，
 * 而建行函数一旦开始写库，「造行」与「落库」的边界就没了，全有或全无也就无从谈起。
 */
export function createBranchCommitRows(
  entityManager: EntityManager,
  branchId: string,
  generation: number
): [CommitBranchRef, WorkingTreeState] {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = branchId;
  ref.branchId = branchId;
  ref.generation = generation;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;

  const state = entityManager.instantiate(WorkingTreeState);
  state.id = branchId;
  state.branchId = branchId;
  state.baseHeadCommitId = null;
  state.workingTreeRevision = 0;
  state.entryCount = 0;

  return [ref, state];
}

/**
 * 读一条分支的 ref；不在就连同工作树状态行一起补出来。
 *
 * @param executor - 调用方那个写事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 分支 id
 * @returns 已存在的那一行，或刚补出来的新行
 * @throws {@link RxDBError} 激活态行缺失时（由 `allocateBranchGeneration` 抛）
 *
 * @remarks
 * 这是**恢复路径**，不是常规路径：三条入口都写全之后，缺行只会出现在被旧版本
 * `createBranch()` 建过分支的那些库上。补行让 `working-tree-facade.ts` 承诺的
 * 「再调一次 `enable()` 就能补根」对它们重新成立——否则那些库只能靠手工改表脱困。
 *
 * 补出来的代际同样走 {@link allocateBranchGeneration} 发放，不是随手填一个：
 * 复用既有代际会让持旧 `(branchId, headRevision)` 的调用方误中这条分支（ABA）。
 *
 * **只给本地分支用。** 远端分支的 ref 属于远端那份提交图，本地补一行出来等于凭空
 * 宣称「这条远端分支在本地有一个空 HEAD」，下一次同步就会拿它去比对。
 */
export const ensureBranchCommitRows = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  branchId: string
): Promise<CommitBranchRef> => {
  const [existing] = await executor.getRepository(CommitBranchRef).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (existing) return existing;

  const rows = createBranchCommitRows(entityManager, branchId, await allocateBranchGeneration(executor));
  await executor.saveMany(rows);
  return rows[0];
};
