/**
 * @fileoverview `discardWorkingTree()` —— 把当前分支的工作树整体退回当前 HEAD（FR-016）。
 *
 * @remarks
 * 四件事在这里被钉死：
 *
 * 1. **范围是整棵工作树，签名里没有 selection 入参。** 「只丢这几个单元」是硬裁决 1 在
 *    discard 一侧的同一个口子：留下的那一半立刻成为残量，而 v1 只有 `HEAD ↔ 工作树`
 *    一条 diff 轴，没有第二个参照物能描述「剩下的那条相对谁」。
 * 2. **clean 时是真正的 no-op：一格 revision 都不涨，一条写语句都不发。** 平白 +1 会让
 *    另一个 realm 手里刚读到的 revision 凭空作废——这次丢弃什么都没做，却让别人的
 *    `commit()` 失败一次（data-model.md §5 脚注）。
 * 3. **三个捕获位的比较排在 no-op 判定之前。** 「反正没东西可丢，校验可以跳过」不成立：
 *    「有没有东西可丢」读的正是那一行可能已被别人改过的状态。别人刚提交完、工作树确实
 *    空了，而调用方手里那份 revision 早就过期——先判 no-op 会回一个成功，让调用方以为
 *    自己丢掉的是他看过的那些改动。
 * 4. **HEAD 一列都不动。** discard 不是 `reset --hard HEAD~1`：它不写提交历史，也不挪
 *    `baseHeadCommitId`。
 *
 * **v1 的 discard 只回滚「逻辑工作树」，不在本命令内重写业务投影。** epic-006 的写入口
 * 语义矩阵把两件事分成两行，而 data-model.md §5 给 discard 列出的效果恰好是三条簿记
 * （revision +1、删条目、`entryCount` 归零）。投影重写只能经 `mergeChanges` / `switchBranch`
 * 两个原语，而它们要求调用点以「文件基名 + 符号 + 意图」登记在 `TRUSTED_CALLSITE_REGISTRY` 里——
 * 本文件没有登记行，`TrustedWriteIntent` 里也没有「丢弃」这一项。要跨这条线，得连同
 * epic-006「受信调用点登记表」、登记表、意图枚举与漂移用例一起显式改掉。
 *
 * 损坏守卫复用 `commit/commit-graph-guard.ts` 那一份（T038/T084），不在这里另写判定：
 * 三个入口拒绝码相同，调用方才有一个稳定的 catch 分支（FR-051）。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../commit/list-commits.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import { discardActiveRestoreSession } from './restore-session-transitions.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { buildWorkingTreeDiscardTransitionSql } from './working-tree-state-sql.js';
import { WorkingTreeState } from './working-tree-state.entity.js';

/**
 * 一次 `discard()` 的入参（contracts/core-api.md §3）。
 *
 * @remarks
 * 键集恰好是三个捕获位。多出来的任何一个字段，要么是选择范围（上面第 1 条的口子），
 * 要么是 `authorId` / `operationId`——而 discard **不写 commit**，给它作者与幂等键
 * 等于暗示库里会留下一条「某人丢弃过什么」的记录，那条记录不存在。
 */
export type WorkingTreeDiscardOptions = WorkingTreeCredentials;

/**
 * 一次 `discard()` 的结果。
 *
 * @remarks
 * 成功出口**没有 `noop` 布尔位**：`discardedCount === 0` 就是 no-op，多一位就是第二份
 * 真相，而两份真相里迟早有一份是旧的。
 */
export type WorkingTreeDiscardResult =
  | {
      /** 工作树已经回到 HEAD */
      readonly ok: true;
      /** 本次丢掉的单元数；`0` 即语义 no-op */
      readonly discardedCount: number;
      /** 丢弃之后的工作树 revision；no-op 时是原值 */
      readonly workingTreeRevision: number;
    }
  | {
      /** 三个捕获位中有一个对不上，本次丢弃一个字节都没落地 */
      readonly ok: false;
      /** 诊断值；**不入库** */
      readonly conflict: CommitConflict;
    };

/**
 * 读当前分支的全部未提交条目。
 *
 * @remarks
 * **带 `branchId`**：不带的话，这条 DELETE 在单分支的库上永远绿，在真实用户的库上一次
 * 就把另一条分支的工作成果抹掉——而那条分支此刻甚至不是 active，没人在看。
 */
const readBranchEntries = (executor: TransactionExecutor, branchId: string): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] }
  });

/**
 * 把当前分支的工作树整体退回当前 HEAD（FR-016）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param options - 见 {@link WorkingTreeDiscardOptions}；三个捕获位全部必填
 * @returns 见 {@link WorkingTreeDiscardResult}
 * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏时（FR-051）
 * @throws {@link NoActiveBranchError} 零 active 分支时
 *
 * @remarks
 * 损坏分支上**先拒绝再说**：「反正这个分支坏了，顺手清干净」会让用户在唯一还能导出
 * 诊断的时刻失去未提交的那部分数据。
 *
 * no-op 的判据取**实际条目行数**而不是 `entryCount` 冗余列：两者万一已经分岔，按冗余列
 * 判会把一批真实存在的条目永久留在表里（而 `status()` 报干净），按行数判则顺带把冗余列
 * 收敛回真实值。真正发现分岔是 {@link assertWorkingTreeEntryCountIntact} 的职责。
 *
 * 恢复会话与条目**一并清除**（US-307 AC5）：丢弃掉的正是那次恢复写进工作树的全部内容，
 * 留着会话会让 `status()` 继续报 `restoring`，而它指向的那批变更已经不在库里了。
 * {@link discardActiveRestoreSession} 排在状态行 UPDATE 之后，且只在非 no-op 路径上——
 * 上面第 2 条要求 clean 丢弃一条写语句都不发。
 */
export const discardWorkingTree = async (
  executor: TransactionExecutor,
  options: WorkingTreeDiscardOptions
): Promise<WorkingTreeDiscardResult> => {
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
  if (entries.length === 0) {
    return { ok: true, discardedCount: 0, workingTreeRevision: state.workingTreeRevision };
  }

  await executor.removeMany(entries);
  const workingTreeRevision = state.workingTreeRevision + 1;
  await executor.query(
    buildWorkingTreeDiscardTransitionSql(executor.tableRef(WorkingTreeState), {
      branchId: token.branchId,
      workingTreeRevision
    })
  );
  await discardActiveRestoreSession(executor, token.branchId);

  state.workingTreeRevision = workingTreeRevision;
  state.entryCount = 0;
  return { ok: true, discardedCount: entries.length, workingTreeRevision };
};
