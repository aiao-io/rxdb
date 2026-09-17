/**
 * @fileoverview `commit(message, options)` —— 把当前分支工作树里的**全部**未提交单元
 * 一次性写进历史，并在**同一个事务**里清空工作树（FR-011、FR-041、FR-051、SC-007）。
 *
 * @remarks
 * 四件事在这里被钉死，每一件都对应一种会安静退化的写法：
 *
 * 1. **签名里没有 selection 入参。** v1 没有暂存区，`commit()` 提交的就是
 *    `status()` 刚刚报给用户的那一整批（硬裁决 1）。开一个 `unitIds` 形参不是「先留个位子」，
 *    而是把「提交我看过的全部」偷换成「提交我挑过的一部分」——后者需要一套暂存语义来回答
 *    「没挑中的那些去哪了」，而 v1 根本没有那套语义。
 * 2. **三个捕获位由调用方给，本函数一个都不自己补。** 缺省成「内部读一次当前值」的话，
 *    比较恒等，CAS 永远命中——比不校验更糟，因为它看起来校验过了
 *    （{@link findCommitConflict} 的 remarks 展开了这一条）。
 * 3. **冲突是返回值，不是异常，也不重试**（contracts/core-api.md §4.1）。自动重试会拿
 *    重读到的新 revision 再打一次 CAS，于是那一次必然成功——而它提交的正是用户没看过的变更。
 * 4. **清空工作树与写 commit 同事务、且排在写 commit 之后。** 先清后写，中途崩一次就
 *    永久丢掉那批变更；异步清理则留下「历史里已有、工作树里还在」的重复态——下一次提交
 *    会把同一批内容再提交一遍（FR-011、SC-007）。
 *
 * 损坏守卫直接复用 `commit/commit-graph-guard.ts` 的那一份（T038），**不在这里另写判定**：
 * 两份判定迟早分岔，而分岔的表现是同一条损坏链在 `commit()` 与 conformance 套件里得到
 * 两种结论（FR-051）。
 *
 * 状态行的转移走**裸 SQL 单条 UPDATE**而不是 `repository.update()`：`workingTreeRevision`
 * 与 `entryCount` 必须在同一条语句里改（conformance-suites.md §2.4）。拆成两句的话，
 * 两句之间崩一次就留下「计数说没有、条目表里还有两条」的库——而 `status()` 的「干净」
 * 判定全压在那一列上。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import type { CommitChangeUnitContent } from '../commit/change-unit.js';
import type { CommitBranchRef } from '../commit/commit-branch-ref.entity.js';
import type { CommitWriteContext } from '../commit/commit-context.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { writeCommit, type WriteCommitOutcome } from '../commit/write-commit.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import { commitActiveRestoreSession } from './restore-session-transitions.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { buildWorkingTreeCommitTransitionSql } from './working-tree-state-sql.js';
import { WorkingTreeState } from './working-tree-state.entity.js';

/**
 * 一次 `commit()` 的入参（contracts/core-api.md §4）。
 *
 * @remarks
 * **`authorId` 与 `operationId` 都是必填。** 作者可选的话，一条历史里会同时存在
 * 有作者与无作者的 commit，而后者在多设备场景里永远说不清是谁提交的；操作 id 可选的话，
 * 幂等键只能由内容合成，于是「同样内容的两次提交」会被判成同一次（见
 * `commit/commit-idempotency.ts`）。
 *
 * **没有 selection 入参**——这是 v1 硬裁决 1，不是签名未完成（FR-041）。
 */
export interface CommitOptions extends WorkingTreeCredentials {
  /** 提交作者；落进不可变历史的 `Commit.author` */
  readonly authorId: string;

  /** 调用方的操作 id；同一次逻辑提交的重试必须带同一个值 */
  readonly operationId: string;
}

/**
 * 一次 `commit()` 的结果。
 *
 * @remarks
 * 判别位是 `ok` 而不是「`conflict` 在不在」：后者要求调用方用 `'conflict' in result`
 * 或可选属性判空，而可选属性在 `strictNullChecks` 关掉的消费端会静默塌成「总是成功」。
 */
export type CommitResult =
  | {
      /** 本次提交已落库 */
      readonly ok: true;
      /** 新 commit 的 id */
      readonly commitId: string;
      /** 本次提交的变更单元数 */
      readonly changeSetCount: number;
      /** 推进之后的 HEAD revision */
      readonly headRevision: number;
    }
  | {
      /** 三个捕获位中有一个对不上，本次提交一个字节都没落地 */
      readonly ok: false;
      /** 诊断值；**不入库**，也没有「清除冲突」的 API */
      readonly conflict: CommitConflict;
    };

/**
 * 读当前分支全部未提交条目，按插入顺序。
 *
 * @remarks
 * **按 `id` 升序**而不是让后端自由排：`CommitChangeSet.sequence` 按这个顺序密集发放，
 * 而内容指纹又吃这个顺序。排序不定的话，同一批变更在两个后端上算出两个指纹，
 * `assertCommitGraphIntact()` 会把其中一边整条链判成损坏。
 */
const readBranchEntries = (executor: TransactionExecutor, branchId: string): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });

/**
 * 把工作树条目摊成提交用的变更单元。
 *
 * @remarks
 * 逐字段挑而不是 `{...row}`：条目行上的 `id` / `fingerprint` / `sourceChangeId` /
 * `branchId` / 时间戳是**工作树的**簿记，不属于不可变历史。整行展开的话，它们会进
 * `CommitChangeSet`，也会进内容指纹——于是同样的内容因为条目行 id 不同而算出不同的指纹。
 */
const toChangeUnit = (row: WorkingTreeEntry): CommitChangeUnitContent => ({
  unitId: row.unitId,
  transactionId: row.transactionId,
  namespace: row.namespace,
  entity: row.entity,
  entityId: row.entityId,
  operation: row.operation,
  patch: row.patch,
  inversePatch: row.inversePatch,
  origin: row.origin
});

/**
 * 把 `writeCommit()` 的 CAS 落败翻译成 {@link CommitConflict}。
 *
 * @remarks
 * 走到这里意味着我们自己那三次比较全过了、ref 的三个 CAS 谓词却没命中——在一个真正的
 * 事务里不该发生。重读一次只为把**真实的**当前值报出去：把 `expected` 原样当成 `actual`
 * 回填的话，调用方拿到一个 `expected === actual` 的冲突，除了「失败了」什么也看不出来。
 * 这是一次诊断读，不是重试：这条路径上不会再打第二条 CAS。
 */
const toHeadConflict = async (
  executor: TransactionExecutor,
  branchId: string,
  expectedHeadRevision: number
): Promise<CommitConflict> => {
  const ref = await readCommitBranchRef(executor, branchId);
  return { kind: 'head_revision', expected: expectedHeadRevision, actual: ref.headRevision, branchId };
};

/** 提交落库之后，把事务内已读出来的两行同步到新值。 */
const syncRowsAfterCommit = (
  ref: CommitBranchRef,
  state: WorkingTreeState,
  next: { commitId: string; headRevision: number; workingTreeRevision: number }
): void => {
  ref.headCommitId = next.commitId;
  ref.headRevision = next.headRevision;
  state.baseHeadCommitId = next.commitId;
  state.workingTreeRevision = next.workingTreeRevision;
  state.entryCount = 0;
};

/** {@link finishCommit} 的入参；单列成型只为把主函数的嵌套压在 3 层以内。 */
interface FinishCommitInput {
  /** 本次提交的全部条目行，待整批删除 */
  readonly entries: readonly WorkingTreeEntry[];
  /** 事务内读出的 ref 行，落库后就地同步 */
  readonly ref: CommitBranchRef;
  /** 事务内读出的状态行，落库后就地同步 */
  readonly state: WorkingTreeState;
  /** `writeCommit()` 的结果 */
  readonly outcome: WriteCommitOutcome;
  /** 原样透传的入参 */
  readonly options: CommitOptions;
  /** 当前 active 分支 */
  readonly branchId: string;
}

/**
 * 写完 commit 之后的收尾：清条目、推状态行、结束恢复会话、同步内存行（T081、T107）。
 *
 * @remarks
 * `reused` 分支**什么都不清**：同一个幂等键此前那次提交已经在它自己的事务里清过一遍，
 * 再删一次删掉的是那之后新捕获的变更。它也不推 revision，也不结束恢复会话——本次调用
 * 没有产生状态转移，而真正结束那个会话的是此前那次提交。
 *
 * {@link commitActiveRestoreSession} 排在状态行 UPDATE **之后**：会话只在工作树确实
 * 落进历史之后才算结束；这个分支上没有未结束会话时它一条语句都不发（FR-015）。
 */
const finishCommit = async (executor: TransactionExecutor, input: FinishCommitInput): Promise<CommitResult> => {
  const { outcome, ref, state } = input;
  if (outcome.status === 'head_revision_conflict') {
    return { ok: false, conflict: await toHeadConflict(executor, input.branchId, outcome.expectedHeadRevision) };
  }
  if (outcome.status === 'reused') {
    return {
      ok: true,
      commitId: outcome.commit.id,
      changeSetCount: outcome.commit.changeSetCount,
      headRevision: ref.headRevision
    };
  }

  await executor.removeMany([...input.entries]);
  const workingTreeRevision = state.workingTreeRevision + 1;
  await executor.query(
    buildWorkingTreeCommitTransitionSql(executor.tableRef(WorkingTreeState), {
      branchId: input.branchId,
      baseHeadCommitId: outcome.commit.id,
      workingTreeRevision
    })
  );
  await commitActiveRestoreSession(executor, input.branchId);

  const headRevision = input.options.expectedHeadRevision + 1;
  syncRowsAfterCommit(ref, state, { commitId: outcome.commit.id, headRevision, workingTreeRevision });
  return { ok: true, commitId: outcome.commit.id, changeSetCount: outcome.commit.changeSetCount, headRevision };
};

/**
 * 提交当前分支工作树里的全部未提交单元（FR-041）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param context - 见 {@link CommitWriteContext}：造 commit 行的实体管理器与 at-rest 判定上下文
 * @param message - 用户消息；落库前 trim，空消息由 `writeCommit()` 拒绝
 * @param options - 见 {@link CommitOptions}；三个捕获位全部必填
 * @returns 见 {@link CommitResult}
 * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏时（FR-051）
 * @throws {@link CommitValidationError} 消息为空、或工作树是干净的（`empty_commit`）
 * @throws {@link NoActiveBranchError} 零 active 分支时
 *
 * @remarks
 * 步骤顺序全是有理由的：
 *
 * 1. **先读 active 分支令牌**，此后一切都打在它身上。在事务中途再查一次 active 分支
 *    并把这笔提交归过去，是明令禁止的形态：那样永远不会失败，代价是用户在 A 分支上
 *    看到的变更被写进 B 分支的历史。
 * 2. **损坏守卫先于 CAS**。反过来的话，一条已损坏的链上、凭据又恰好对得上的提交会直接
 *    落库，把新节点挂到一段自己都校验不过的历史后面（FR-051）。
 * 3. **三次比较全部先于任何写入**，任一不匹配即返回 {@link CommitConflict}，此时没有
 *    任何东西需要回滚——这正是它做成返回值而非异常的原因。
 * 4. **写 commit → 清条目 → 单条状态 UPDATE**，全在调用方那一个事务里。
 *
 * 干净分支上**抛 `empty_commit`** 而不是返回一个 `ok: true` 的空提交：空 commit 会在
 * 历史里留下一个内容为零的节点，此后每次「没什么可提交」都长出一个，而 `log()` 没有
 * 任何依据把它们藏起来。
 */
export const commitWorkingTree = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  message: string,
  options: CommitOptions
): Promise<CommitResult> => {
  const token = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, token.branchId);

  const ref = await readCommitBranchRef(executor, token.branchId);
  const state = await readWorkingTreeStateRow(executor, token.branchId);
  const conflict = findCommitConflict(options, {
    token,
    headRevision: ref.headRevision,
    workingTreeRevision: state.workingTreeRevision
  });
  if (conflict) return { ok: false, conflict };

  const entries = await readBranchEntries(executor, token.branchId);
  const outcome = await writeCommit(executor, context, {
    branchId: token.branchId,
    branchGeneration: ref.generation,
    expectedHeadRevision: options.expectedHeadRevision,
    kind: 'normal',
    message,
    author: options.authorId,
    operationId: options.operationId,
    units: entries.map(toChangeUnit)
  });

  return finishCommit(executor, { entries, ref, state, outcome, options, branchId: token.branchId });
};
