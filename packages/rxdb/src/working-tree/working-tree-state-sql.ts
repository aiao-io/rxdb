/**
 * @fileoverview `rxdb_working_tree_state` 的两种状态转移语句（data-model.md §2.6、§5）。
 *
 * @remarks
 * 两件事在这里被钉死：
 *
 * 1. **裸 SQL，不走 `repository.update()`。** `workingTreeRevision` 与 `entryCount` 必须在
 *    **同一条** UPDATE 里改（conformance-suites.md §2.4 第二条）。经仓库改两个字段虽然也能
 *    合成一条语句，但语句形状由仓库决定，本目录拿不到「恰好一条、且同时含这两列」的保证。
 * 2. **commit 与 discard 各有一条明确命名的语句，不做成一个带可选列的通用 builder。**
 *    `baseHeadCommitId` 是两者**唯一**的区别，而它正是最不该被可选参数模糊掉的那一列：
 *    discard 不动 HEAD（FR-016），传漏一次就把工作树基线悄悄挪到别处，此后 `diff()`
 *    的参照物与 HEAD 不再是同一个 commit，而库里没有任何一处会报错。
 *
 * 列名一律经 {@link getEntityColumnName} 取，不写字面量：写死 `entry_count` 会在列被
 * 改名的那天继续拼出一条语法正确、打在不存在的列上的 SQL。
 */

import { getEntityColumnName } from '../entity/entity-field.utils.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { quoteSqlIdentifier, sqlIntegerLiteral, sqlStringLiteral } from '../system/sql-literal.js';
import { WorkingTreeState } from './working-tree-state.entity.js';

/** `WorkingTreeState` 里参与状态转移的那几列。 */
type WorkingTreeStateColumn = 'id' | 'baseHeadCommitId' | 'workingTreeRevision' | 'entryCount';

/** 取一列的真实列名并加引号。 */
const columnOf = (metadata: EntityMetadata, field: WorkingTreeStateColumn): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`WorkingTreeState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/** 把若干 `列 = 值` 片段拼成一条打在单个分支上的 UPDATE。 */
const assemble = (tableRef: string, metadata: EntityMetadata, assignments: string[], branchId: string): string =>
  [
    `UPDATE ${tableRef}`,
    `SET ${assignments.join(', ')}`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(branchId)}`
  ].join(' ');

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
    metadata,
    [
      `${columnOf(metadata, 'baseHeadCommitId')} = ${sqlStringLiteral(transition.baseHeadCommitId)}`,
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.workingTreeRevision)}`,
      `${columnOf(metadata, 'entryCount')} = ${sqlIntegerLiteral(0)}`
    ],
    transition.branchId
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
    metadata,
    [
      `${columnOf(metadata, 'workingTreeRevision')} = ${sqlIntegerLiteral(transition.workingTreeRevision)}`,
      `${columnOf(metadata, 'entryCount')} = ${sqlIntegerLiteral(0)}`
    ],
    transition.branchId
  );
};
