/**
 * @fileoverview `rxdb_working_tree_state` 的三种状态转移语句（data-model.md §2.6、§5）。
 *
 * @remarks
 * 两件事在这里被钉死：
 *
 * 1. **裸 SQL，不走 `repository.update()`。** `workingTreeRevision` 与 `entryCount` 必须在
 *    **同一条** UPDATE 里改（conformance-suites.md §2.4 第二条）。经仓库改两个字段虽然也能
 *    合成一条语句，但语句形状由仓库决定，本目录拿不到「恰好一条、且同时含这两列」的保证。
 * 2. **commit / discard / restore 各有一条明确命名的语句，不做成一个带可选列的通用 builder。**
 *    `baseHeadCommitId` 是两者**唯一**的区别，而它正是最不该被可选参数模糊掉的那一列：
 *    discard 不动 HEAD（FR-016），传漏一次就把工作树基线悄悄挪到别处，此后 `diff()`
 *    的参照物与 HEAD 不再是同一个 commit，而库里没有任何一处会报错。
 *
 * 列名一律经 {@link getEntityColumnName} 取，不写字面量：写死 `entry_count` 会在列被
 * 改名的那天继续拼出一条语法正确、打在不存在的列上的 SQL。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import {
  getEntityColumnName,
  getEntityMetadata,
  quoteSqlIdentifier,
  RxDBError,
  sqlIntegerLiteral,
  sqlStringLiteral
} from '@aiao/rxdb';
import { WorkingTreeState } from './working-tree-state.entity.js';

/** `WorkingTreeState` 里参与状态转移的那几列。 */
type WorkingTreeStateColumn = 'id' | 'baseHeadCommitId' | 'workingTreeRevision' | 'entryCount';

/** 取一列的真实列名并加引号。 */
const columnOf = (metadata: EntityMetadata, field: WorkingTreeStateColumn): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`WorkingTreeState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/** 定位单个分支状态行的等值谓词。 */
const branchPredicate = (metadata: EntityMetadata, branchId: string): string =>
  `${columnOf(metadata, 'id')} = ${sqlStringLiteral(branchId)}`;

/**
 * 把若干 `列 = 值` 片段拼成一条 UPDATE。
 *
 * @remarks
 * `predicates` 是列表而不是单个 branchId：restore 不推进 HEAD，`workingTreeRevision`
 * 是它**唯一**的 CAS 锚点，谓词必须能多带一条 `revision = ?`（见
 * {@link buildWorkingTreeRestoreTransitionSql}）。commit / discard 各自只传一条。
 */
const assemble = (tableRef: string, assignments: string[], predicates: string[]): string =>
  [`UPDATE ${tableRef}`, `SET ${assignments.join(', ')}`, `WHERE ${predicates.join(' AND ')}`].join(' ');

/** 一次提交收尾要写进状态行的三个值。 */
export interface WorkingTreeCommitTransition {
  /** 目标分支 */
  readonly branchId: string;
  /** 新 HEAD 的 commit id；工作树基线随之前移 */
  readonly baseHeadCommitId: string;
  /** 推进后的工作树 revision */
  readonly workingTreeRevision: number;
}

/** 一次丢弃要写进状态行的两个值。 */
export interface WorkingTreeDiscardTransition {
  /** 目标分支 */
  readonly branchId: string;
  /** 推进后的工作树 revision */
  readonly workingTreeRevision: number;
}

/**
 * 提交收尾：基线前移到新 HEAD、revision 前进一格、条目数归零。
 *
 * @param tableRef - 状态表的带库前缀引用，取自 `executor.tableRef()`
 * @param transition - 见 {@link WorkingTreeCommitTransition}
 * @returns 单条 SQL
 */
export const buildWorkingTreeCommitTransitionSql = (
  tableRef: string,
  transition: WorkingTreeCommitTransition
): string => {
  const metadata = getEntityMetadata(WorkingTreeState);
  return assemble(
    tableRef,
    [
      `${columnOf(metadata, 'baseHeadCommitId')} = ${sqlStringLiteral(transition.baseHeadCommitId)}`,
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.workingTreeRevision)}`,
      `${columnOf(metadata, 'entryCount')} = ${sqlIntegerLiteral(0)}`
    ],
    [branchPredicate(metadata, transition.branchId)]
  );
};

/**
 * 丢弃收尾：revision 前进一格、条目数归零，**`baseHeadCommitId` 一个字都不动**。
 *
 * @param tableRef - 状态表的带库前缀引用，取自 `executor.tableRef()`
 * @param transition - 见 {@link WorkingTreeDiscardTransition}
 * @returns 单条 SQL
 *
 * @remarks
 * discard 不是 `reset --hard HEAD~1`：它的落点只有工作树，提交历史与 HEAD 一列都不动
 * （FR-016）。顺手更新基线的话，一次丢弃就把 `diff()` 的参照物挪成了「上一次丢弃时的
 * HEAD」，而那与真正的 HEAD 只在下一次提交后才看得出差别。
 */
export const buildWorkingTreeDiscardTransitionSql = (
  tableRef: string,
  transition: WorkingTreeDiscardTransition
): string => {
  const metadata = getEntityMetadata(WorkingTreeState);
  return assemble(
    tableRef,
    [
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.workingTreeRevision)}`,
      `${columnOf(metadata, 'entryCount')} = ${sqlIntegerLiteral(0)}`
    ],
    [branchPredicate(metadata, transition.branchId)]
  );
};

/** 一次恢复要写进状态行的值，外加它赖以成立的 CAS 期望。 */
export interface WorkingTreeRestoreTransition {
  /** 目标分支 */
  readonly branchId: string;
  /** 读到这批值时看见的工作树 revision——本次 UPDATE 的 CAS 锚点 */
  readonly expectedWorkingTreeRevision: number;
  /** 推进后的工作树 revision */
  readonly workingTreeRevision: number;
  /** 恢复落进工作树的条目数 */
  readonly entryCount: number;
}

/**
 * 恢复收尾：revision 前进一格、条目数改成恢复出来的行数，**`baseHeadCommitId` 一个字都不动**。
 *
 * @param tableRef - 状态表的带库前缀引用，取自 `executor.tableRef()`
 * @param transition - 见 {@link WorkingTreeRestoreTransition}
 * @returns 单条 SQL
 *
 * @remarks
 * 与另外两条的区别在 WHERE，不在 SET：commit 的 CAS 打在 `rxdb_commit_branch_ref` 的
 * `headRevision` 上，discard 在丢弃前已经用 `findCommitConflict` 比过一轮且**不改** HEAD，
 * 而 restore 既不推进 HEAD、又要在写入条目之前独占工作树，于是 `workingTreeRevision`
 * 是它唯一能用的锚点——谓词里少这一条，两个并发 restore 会各自把自己的条目叠进同一棵
 * 工作树，而两边都读到 `rowsAffected = 1`。
 *
 * `entryCount` 这里不是归零而是赋值：恢复的产物本身就是未提交条目（FR-015）。
 */
export const buildWorkingTreeRestoreTransitionSql = (
  tableRef: string,
  transition: WorkingTreeRestoreTransition
): string => {
  const metadata = getEntityMetadata(WorkingTreeState);
  return assemble(
    tableRef,
    [
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.workingTreeRevision)}`,
      `${columnOf(metadata, 'entryCount')} = ${sqlIntegerLiteral(transition.entryCount)}`
    ],
    [
      branchPredicate(metadata, transition.branchId),
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.expectedWorkingTreeRevision)}`
    ]
  );
};
