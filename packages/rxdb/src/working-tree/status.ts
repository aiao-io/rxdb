/**
 * @fileoverview `status()` 的常数时间摘要（FR-004，data-model.md §2.6 / §2.8）
 *
 * @remarks
 * 三件事在这里被钉死，每一件都对应一种会安静退化的写法：
 *
 * 1. **`restoring` 与 `conflicted` 是两位，不是一位。** 压成一位之后「恢复进行到一半」
 *    与「有未提交变更」在返回值上一模一样，界面没法在恢复未收尾时拦住用户点提交。
 * 2. **`conflicted` 的唯一来源是 `WorkingTreeRestoreSession`。** `CommitConflict` 是一次
 *    失败命令的返回值、**不入库**（contracts/core-api.md §4.1）。把上一次 CAS 失败记在
 *    某处再喂进来，库里就有了两份互相漂移的冲突真相，而其中一份没有任何人负责清。
 * 3. **条目数取 {@link WorkingTreeState.entryCount} 冗余列，不走 `COUNT(*)`。** 冗余列
 *    存在的全部理由就是让「有没有未提交变更」走常数时间（SC-001 的 100 ms 绝对上限）。
 *    冗余列与实际行数的自洽由 {@link assertWorkingTreeEntryCountIntact} 单独守——
 *    摘要路径上不做这件事，否则每次 `status()` 都要扫一遍条目表，冗余列就白存了。
 *
 * `byOrigin` 在干净分支上短路成两个 0：`entryCount === 0` 时条目表里没有本分支的行，
 * 分组结果不查也知道。这条短路不是优化，是上面第 3 条的一部分——「干净」是最常被问的
 * 那个问题，它必须一条针对条目表的查询都不发。
 */

import { readCommitBranchRef } from '../commit/list-commits.js';
import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { WorkingTreeRestoreSession } from './working-tree-restore-session.entity.js';
import type { WriteEntryOrigin } from './write-entry-matrix.js';

/**
 * 未提交条目按来源的分布。
 *
 * @remarks
 * 键集跟着 {@link WriteEntryOrigin} 走而不是手写两个字段：来源取值域将来增补时，
 * 漏改这里会让新来源的条目在摘要里凭空消失，而 `entryCount` 照旧把它们算进去——
 * 用户看到一个「三个单元、两个来源加起来只有两个」的状态。
 */
export type WorkingTreeOriginBreakdown = Readonly<Record<WriteEntryOrigin, number>>;

/**
 * 一次 `status()` 的全部回答（contracts/core-api.md §3）。
 *
 * @remarks
 * 三个 revision 字段（{@link WorkingTreeStatus.activationRevision} /
 * {@link WorkingTreeStatus.headRevision} / {@link WorkingTreeStatus.workingTreeRevision}）
 * 缺一不可：它们恰好是 `commit()` / `discard()` 要求调用方捕获的那三个位。少给一个，
 * 调用方就永远构造不出一次不会撞 `CommitConflict` 的提交。
 */
export interface WorkingTreeStatus {
  /** 当前 active 分支 id */
  readonly branchId: string;

  /** 未提交条目数，取自冗余列 */
  readonly entryCount: number;

  /** 没有未提交条目 */
  readonly clean: boolean;

  /** 有未结束的恢复会话，且它捕获的两个 revision 仍然对得上 */
  readonly restoring: boolean;

  /** 有未结束的恢复会话，但它捕获的 revision 已经分叉 */
  readonly conflicted: boolean;

  /** 未提交条目按来源的分布；`remote_sync` **不豁免**（硬裁决 6） */
  readonly byOrigin: WorkingTreeOriginBreakdown;

  /** 捕获位之一：分支激活 revision */
  readonly activationRevision: number;

  /** 捕获位之一：HEAD 推进 revision */
  readonly headRevision: number;

  /** 捕获位之一：工作树 revision */
  readonly workingTreeRevision: number;
}

/**
 * 冗余列与实际条目行数对不上。
 *
 * @remarks
 * **不发明第十个 `CommitErrorCode`**：`contracts/core-api.md` §7 那张表是封闭的，
 * 而这条不是某个命令的失败出口，是「库里两份真相对不上」的现场——与 cold-replay 的
 * `WorkingTreeReplayCorruptionError` 同类。判别位给 `name` 与三个事实字段。
 */
export class WorkingTreeEntryCountMismatchError extends RxDBError {
  constructor(
    /** 出问题的分支 */
    readonly branchId: string,
    /** 冗余列说的数 */
    readonly expected: number,
    /** 条目表里真实的行数 */
    readonly actual: number
  ) {
    super(
      `分支 ${branchId} 的 rxdb_working_tree_state.entryCount 是 ${expected}，` +
        `而 rxdb_working_tree_entry 里实际有 ${actual} 行。冗余列与行数必须在同一事务内一起改。`
    );
    this.name = 'WorkingTreeEntryCountMismatchError';
    Object.setPrototypeOf(this, WorkingTreeEntryCountMismatchError.prototype);
  }
}

/** 分组时遍历的来源取值域；顺序只影响发查询的顺序。 */
const WRITE_ENTRY_ORIGINS: readonly WriteEntryOrigin[] = ['local', 'remote_sync'];

/** 干净分支的分布常量；短路时直接返回它的副本。 */
const emptyBreakdown = (): Record<WriteEntryOrigin, number> => ({ local: 0, remote_sync: 0 });

/** 数某个分支某个来源的未提交条目。 */
const countEntriesOfOrigin = (
  executor: TransactionExecutor,
  branchId: string,
  origin: WriteEntryOrigin
): Promise<number> =>
  executor.getRepository(WorkingTreeEntry).count({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: branchId },
        { field: 'origin', operator: '=', value: origin }
      ]
    }
  });

/**
 * 按来源分组数一遍未提交条目。
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 目标分支
 * @param entryCount - 冗余列当前的值；为 0 时直接短路
 * @returns 见 {@link WorkingTreeOriginBreakdown}
 *
 * @remarks
 * 逐个来源 `count()` 而不是把整张表 `find()` 回来自己分组：摘要只要两个数字，
 * 读回全部 patch 会让「有没有未提交变更」的代价随工作树大小线性增长。
 */
const readOriginBreakdown = async (
  executor: TransactionExecutor,
  branchId: string,
  entryCount: number
): Promise<WorkingTreeOriginBreakdown> => {
  if (entryCount === 0) return emptyBreakdown();
  const breakdown = emptyBreakdown();
  for (const origin of WRITE_ENTRY_ORIGINS) {
    breakdown[origin] = await countEntriesOfOrigin(executor, branchId, origin);
  }
  return breakdown;
};

/** {@link readRestoreBits} 的产物：互斥的两位。 */
interface RestoreBits {
  /** 恢复中 */
  readonly restoring: boolean;
  /** 恢复会话捕获的 revision 已分叉 */
  readonly conflicted: boolean;
}

/**
 * 从恢复会话重建 `restoring` / `conflicted` 两位。
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 目标分支
 * @param headRevision - 当前 HEAD revision
 * @param workingTreeRevision - 当前工作树 revision
 * @returns 见 {@link RestoreBits}
 *
 * @remarks
 * 只认 `activeKey` 非空的那一行——唯一约束保证一分支至多一行（`NULL` 不参与唯一比较）。
 * 把 `status === 'committed'` 的终态行也算进来的话，一个分支的历史里只要有过一次恢复，
 * 此后它永远显示冲突。
 */
const readRestoreBits = async (
  executor: TransactionExecutor,
  branchId: string,
  headRevision: number,
  workingTreeRevision: number
): Promise<RestoreBits> => {
  const [session] = await executor.getRepository(WorkingTreeRestoreSession).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'branchId', operator: '=', value: branchId },
        { field: 'activeKey', operator: 'notNull' }
      ]
    },
    limit: 1
  });
  if (!session) return { restoring: false, conflicted: false };
  const intact =
    session.expectedHeadRevision === headRevision && session.expectedWorkingTreeRevision === workingTreeRevision;
  return { restoring: intact, conflicted: !intact };
};

/**
 * 读当前分支的工作树摘要（FR-004）。
 *
 * @param executor - 调用方那个事务的执行器；本函数不自己开事务
 * @returns 见 {@link WorkingTreeStatus}
 * @throws {@link NoActiveBranchError} 一行 active 分支都没有时
 * @throws {@link AmbiguousActiveBranchError} 有多行 active 分支时
 * @throws {@link RxDBError} ref 行或工作树状态行缺失时
 *
 * @remarks
 * **不在这里校验 `entryCount` 的自洽**：那要扫一遍条目表，而摘要的全部意义是不扫。
 * 不变量交给 {@link assertWorkingTreeEntryCountIntact}，由 conformance 套件与写路径调用。
 */
export const readWorkingTreeStatus = async (executor: TransactionExecutor): Promise<WorkingTreeStatus> => {
  const token = await readActiveBranchToken(executor);
  const ref = await readCommitBranchRef(executor, token.branchId);
  const state = await readWorkingTreeStateRow(executor, token.branchId);
  const restore = await readRestoreBits(executor, token.branchId, ref.headRevision, state.workingTreeRevision);
  const byOrigin = await readOriginBreakdown(executor, token.branchId, state.entryCount);

  return {
    branchId: token.branchId,
    entryCount: state.entryCount,
    clean: state.entryCount === 0,
    restoring: restore.restoring,
    conflicted: restore.conflicted,
    byOrigin,
    activationRevision: token.activationRevision,
    headRevision: ref.headRevision,
    workingTreeRevision: state.workingTreeRevision
  };
};

/**
 * 校验冗余列与实际条目行数一致（data-model.md §2.6）。
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 要校验的分支
 * @throws {@link WorkingTreeEntryCountMismatchError} 两者对不上时（**两个方向都抛**）
 *
 * @remarks
 * **只数本分支。** 不带 `branchId` 的话，隔壁分支的未提交条目会把本分支的计数撑爆，
 * 于是这条断言会在一个完全健康的库上开始误报——而误报的不变量断言很快就会被人关掉。
 *
 * 两个方向都抛：冗余列比行数小同样是第二份真相，症状是 `status()` 报干净、
 * `commit()` 却提交出一批单元。
 */
export const assertWorkingTreeEntryCountIntact = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<void> => {
  const state = await readWorkingTreeStateRow(executor, branchId);
  const actual = await executor.getRepository(WorkingTreeEntry).count({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] }
  });
  if (state.entryCount !== actual) {
    throw new WorkingTreeEntryCountMismatchError(branchId, state.entryCount, actual);
  }
};
