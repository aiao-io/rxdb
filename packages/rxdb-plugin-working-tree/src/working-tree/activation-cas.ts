/**
 * @fileoverview 激活态 revision 的推进：一条持久化 CAS（FR-020/035、data-model.md §2.2）。
 *
 * @remarks
 * 这一列是并发仲裁三个位里的第一位——`findCommitConflict()` 最先比的那一个，也是
 * `main → feature → main` 走一个来回之后**唯一**还认得出「你看的不是这个工作树」的位。
 * 在它被写下之前，它交给调用方的是个恒为初值的常数：三位仲裁里有一位是假的，而三位
 * 都报「已校验」。
 *
 * 三条不可让步的性质：
 *
 * 1. **期望值只能来自调用方。** 本函数不先读一遍再加一：自己读出来的期望值恒等于当前值，
 *    CAS 于是永远命中——与 `commit-conflict.ts` 第 2 条同一个失效形态，而它比不校验更糟，
 *    因为它看起来校验过了。于是命中路径上激活态那张表一次都没被 `find()` 过。
 * 2. **落空是一个值，不是异常，也不重试。** 拿第二次读到的值再打一次 CAS，那一次必然成功，
 *    而它盖掉的正是别人刚做完的那次切换。诊断走**已有的** {@link CommitConflict}，
 *    不新建并行诊断类型：并行类型一旦出现，调用方要分两路处理同一件事，两路迟早各自漂移。
 * 3. **入参只收一个数字，不收整个 token。** 一次 switch 在同一个事务里先把
 *    `rxdb_branch.activated` 挪到目标分支、再推进 revision；期望值里带上源分支 id 的话，
 *    落到这一步时库里的 active 分支已经是目标分支，CAS 会对着一个自己刚写下的值报冲突。
 *    分支身份那一半由写路径的 token 校验（`write-entry.ts` › `assertActiveBranch`）负责。
 */

import type { EntityMetadata, TransactionExecutor } from '@aiao/rxdb';
import {
  getEntityColumnName,
  getEntityMetadata,
  quoteSqlIdentifier,
  RxDBError,
  sqlIntegerLiteral,
  sqlStringLiteral
} from '@aiao/rxdb';
import { readActiveBranchToken } from './capture-runtime.js';
import type { CommitConflict } from './commit-conflict.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from './working-tree-activation-state.entity.js';

/** 取一列的真实列名并加引号；写字面量会在列改名那天拼出一条打在不存在的列上的合法 SQL。 */
const columnOf = (metadata: EntityMetadata, field: 'id' | 'activationRevision'): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`WorkingTreeActivationState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/**
 * 拼这条 CAS：把 revision 从捕获值推到捕获值 +1。
 *
 * @remarks
 * WHERE 里两条谓词都不能少。少了 revision 那一条，这就是一条无条件覆盖：两个标签页各自 +1，
 * 后到的那个把先到的那次切换抹掉，而两边都读到 `rowsAffected = 1`。少了主键那一条，
 * 它会在某天这张表长出第二行时把两行一起改。
 */
const buildActivationBumpCas = (tableRef: string, expectedActivationRevision: number): string => {
  const metadata = getEntityMetadata(WorkingTreeActivationState);
  const revision = columnOf(metadata, 'activationRevision');
  return [
    `UPDATE ${tableRef}`,
    `SET ${revision} = ${sqlIntegerLiteral(expectedActivationRevision + 1)}`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`,
    `AND ${revision} = ${sqlIntegerLiteral(expectedActivationRevision)}`
  ].join(' ');
};

/**
 * 一次推进的结果：要么拿到新号，要么拿到一份诊断。
 *
 * @remarks
 * 做成可辨识联合而不是「返回新号 / 抛异常」：这一路的落空是**并发下的正常结局**
 * （别的标签页刚切过分支），调用方要做的是重新读一次状态再决定，而不是 catch 一个错误。
 */
export type ActivationBumpOutcome =
  | { readonly ok: true; readonly activationRevision: number }
  | { readonly ok: false; readonly conflict: CommitConflict };

/**
 * 推进激活态 revision，走一条持久化 CAS（FR-020）。
 *
 * @param executor - **调用方那个事务**的执行器；本函数不自己开事务
 * @param expectedActivationRevision - 调用方在读取时捕获到的那个号
 * @returns 命中时是推进之后的号；落空时是一份 {@link CommitConflict}
 *
 * @remarks
 * 命中路径上只发**一条**语句、一次 `find()` 都没有——没有「先试再补」的第二次尝试
 * （见本文件 `@fileoverview` 第 1、2 条）。
 *
 * 落空之后才去读一次当前值：`actual` 必须现读库。回填成 `expected` 或者干脆省掉的话，
 * 诊断只剩「冲突了」，而调用方分不清「别人切过一次」与「我手上这份状态是上个世纪的」。
 * `branchId` 取的是**当前** active 分支——它与调用方手上那条不同时，这就是认错分支的证据。
 */
export const bumpActivationRevision = async (
  executor: TransactionExecutor,
  expectedActivationRevision: number
): Promise<ActivationBumpOutcome> => {
  const { rowsAffected } = await executor.query(
    buildActivationBumpCas(executor.tableRef(WorkingTreeActivationState), expectedActivationRevision)
  );
  if (rowsAffected > 0) return { ok: true, activationRevision: expectedActivationRevision + 1 };

  const token = await readActiveBranchToken(executor);
  return {
    ok: false,
    conflict: {
      kind: 'activation_revision',
      expected: expectedActivationRevision,
      actual: token.activationRevision,
      branchId: token.branchId
    }
  };
};
