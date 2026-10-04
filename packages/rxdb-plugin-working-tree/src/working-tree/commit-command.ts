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
import { deriveCommitOperationId, findCommitByOperationId } from '../commit/commit-idempotency.js';
import type { Commit } from '../commit/commit.entity.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { writeCommit, type WriteCommitOutcome } from '../commit/write-commit.js';
import { readActiveBranchToken, readBranchEntries, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import { commitActiveRestoreSession } from './restore-session-transitions.js';
import type { WorkingTreeCommitEvent } from './working-tree-commit-event.js';
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
 * {@link runCommitWorkingTree} 的结果：返回给调用方的 {@link CommitResult}，外加「本次是否写入了新 commit」。
 *
 * @remarks
 * `written` 不能从 `result` 推出来：幂等重放同样是 `ok: true`、带着同一个 `commitId`，只有
 * `writeCommit()` 的 `reused` 判定知道这次什么都没写。门面靠它决定 `commits$` 发不发——
 * 按 `result.ok` 发的话，每次重试都会多出一个指向同一 commit 的事件。
 *
 * **不在公开面上**（`index.ts` 只点名导出本模块的公开成员）：它是门面与命令体之间的接缝。
 */
export interface CommitRun {
  /** 原样交给调用方的结果 */
  readonly result: CommitResult;
  /** 本次写入了新 commit 时是它的关联键；冲突、幂等重放时为 `null` */
  readonly written: WorkingTreeCommitEvent | null;
}

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

/**
 * 按幂等键识别一次已经落库的重试（RV-041：US-305 场景 7，评审 commit.suite.ts 对应断言）。
 *
 * @remarks
 * 只在 {@link findCommitConflict} 已经报出非 `activation_revision` 的冲突时调用——分支认错了
 * 不认任何 `operationId`，必须直接落回下面的 CAS 拒绝（`runCommitWorkingTree` 的调用点保证这一点）。
 *
 * **不比对内容指纹，只比对 `message` / `author`。** `writeCommit()` 内部的指纹比对要靠
 * `input.units`——而原请求重试时工作树早被第一次成功的提交清空，这里的 `units` 永远是空的，
 * 拿它去比只会把一次货真价实的重放误判成「内容不符」。`message` / `author` 不依赖工作树
 * 状态，足够挡住「同一个 operationId 被挪去提另一次不同内容的提交」这类调用方 bug——
 * 这正是指纹比对通常负责的那一半，只是在没有 units 可用时退化成这两个字段。
 *
 * **没命中或两个字段有一个不符，原样返回 `undefined`**，调用点据此落回现有的严格冲突契约
 * （RV-041 修复方案：「没有命中或 payload 不同仍按现有严格错误/冲突契约处理」）——这里不抛
 * `CommitOperationMismatchError`，因为门面的冲突一向是返回值，不是异常。
 */
const findReplayedCommit = async (
  executor: TransactionExecutor,
  key: { branchGeneration: number; operationId: string; message: string; authorId: string }
): Promise<Commit | undefined> => {
  const derived = deriveCommitOperationId({ branchGeneration: key.branchGeneration, operationId: key.operationId });
  const existing = await findCommitByOperationId(executor, derived);
  if (!existing) return undefined;
  if (existing.message !== key.message.trim() || existing.author !== key.authorId.trim()) return undefined;
  return existing;
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
const finishCommit = async (executor: TransactionExecutor, input: FinishCommitInput): Promise<CommitRun> => {
  const { outcome, ref, state } = input;
  if (outcome.status === 'head_revision_conflict') {
    const conflict = await toHeadConflict(executor, input.branchId, outcome.expectedHeadRevision);
    return { result: { ok: false, conflict }, written: null };
  }
  if (outcome.status === 'reused') {
    const { id: commitId, changeSetCount } = outcome.commit;
    return { result: { ok: true, commitId, changeSetCount, headRevision: ref.headRevision }, written: null };
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
  return {
    result: { ok: true, commitId: outcome.commit.id, changeSetCount: outcome.commit.changeSetCount, headRevision },
    written: { commitId: outcome.commit.id, branchId: input.branchId }
  };
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
 * 3. **三次比较全部先于任何写入**，任一不匹配即返回 {@link CommitConflict}——除了
 *    **原请求重试**这一种（RV-041）：HEAD / 工作树 revision 不匹配、但 `operationId` 对应
 *    一条已落库且 `message` / `author` 都对得上的 commit 时，直接回那条 commit，不再往下走。
 *    `activation_revision` 不在这条例外里——分支都认错了就没有「重试」可言，原样落回冲突。
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
): Promise<CommitResult> => (await runCommitWorkingTree(executor, context, message, options)).result;

/**
 * {@link commitWorkingTree} 的命令体，多带一个「本次是否写入了新 commit」（见 {@link CommitRun}）。
 *
 * @remarks
 * 参数、抛出与 {@link commitWorkingTree} 完全一致；门面走这一个，是为了在事务提交之后按
 * `written` 发 `commits$`。
 */
export const runCommitWorkingTree = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  message: string,
  options: CommitOptions
): Promise<CommitRun> => {
  const token = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, token.branchId);

  const ref = await readCommitBranchRef(executor, token.branchId);
  const state = await readWorkingTreeStateRow(executor, token.branchId);
  const conflict = findCommitConflict(options, {
    token,
    headRevision: ref.headRevision,
    workingTreeRevision: state.workingTreeRevision
  });
  if (conflict && conflict.kind !== 'activation_revision') {
    const replay = await findReplayedCommit(executor, {
      branchGeneration: ref.generation,
      operationId: options.operationId,
      message,
      authorId: options.authorId
    });
    if (replay) {
      return {
        result: {
          ok: true,
          commitId: replay.id,
          changeSetCount: replay.changeSetCount,
          headRevision: ref.headRevision
        },
        written: null
      };
    }
  }
  if (conflict) return { result: { ok: false, conflict }, written: null };

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
