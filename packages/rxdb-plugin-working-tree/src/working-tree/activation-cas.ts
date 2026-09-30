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
 * 3. **入参只收一个数字，不收整个 token。** 这是一条打在激活态单例行上的
 *    `UPDATE ... WHERE revision = ?`，它能比的只有这张表自己的列；分支 id 住在 `rxdb_branch`，
 *    要把它也纳入期望值就得先单独读一次那张表再比——那一次比较落在 CAS 之外，
 *    两者之间照样插得进别人的切换，于是多出来的只有「看起来比过了」。分支身份那一半
 *    由写路径的 token 校验（`write-entry.ts` › `assertActiveBranch`）负责，它每次现读库。
 *
 * 本文件另有一支 {@link advanceActivationRevision}：它管的是**切换事务内部**那一次推进，
 * 不是 CAS，理由写在它自己的 TSDoc 里。两者名字相近而语义相反，别在调用点上互换。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, RxDBError, sqlIntegerLiteral, sqlStringLiteral } from '@aiao/rxdb';
import { createColumnOf } from '../entity-column.js';
import { readActiveBranchToken } from './capture-runtime.js';
import type { CommitConflict } from './commit-conflict.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from './working-tree-activation-state.entity.js';

/** `WorkingTreeActivationState` 里参与启用 CAS 的那两列。 */
type WorkingTreeActivationStateColumn = 'id' | 'activationRevision';

const columnOf = createColumnOf<WorkingTreeActivationStateColumn>('WorkingTreeActivationState');

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

/**
 * 拼那条无条件的推进：把 revision 就地 +1。
 *
 * @remarks
 * `SET revision = revision + 1` 而不是 `SET revision = <算好的数>`：后者那个数只能来自一次自读，
 * 于是两条并发切换会读到同一个当前值、写下同一个新号，`A → B → A` 走完之后旧凭据仍然认得出这个库。
 * 让库自己做那一步加法，新号是什么由行锁决定，与调用方读到过什么无关。
 *
 * WHERE 里只有主键那一条。多钉一条 `revision = ?` 就退回成 CAS，而这里没有调用方给的期望值可用
 * （见 {@link advanceActivationRevision}）。
 */
const buildActivationAdvance = (tableRef: string): string => {
  const metadata = getEntityMetadata(WorkingTreeActivationState);
  const revision = columnOf(metadata, 'activationRevision');
  return [
    `UPDATE ${tableRef}`,
    `SET ${revision} = ${revision} + 1`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`
  ].join(' ');
};

/**
 * 无条件推进激活态 revision——每一次真正发生的分支切换都要走这一步（FR-020）。
 *
 * @param executor - **切换事务**的执行器；本函数不自己开事务
 * @throws {@link RxDBError} 单例行不存在（`rowsAffected !== 1`）时
 *
 * @remarks
 * 与 {@link bumpActivationRevision} 的分工，一句话：**那一支替调用方仲裁，这一支不仲裁。**
 *
 * 这一支跑在适配器 `switchBranch()` 的写事务内部，紧接着系统贡献点把前置条件判完的那一刻
 * （`plugin.ts` › `prepareBranchSwitch`）。此刻能当「期望值」用的只有它自己读出来的数，
 * 而自读的期望值恒等于当前值、CAS 于是永远命中——那正是本文件第 1 条点名的失效形态。
 * 真正的仲裁由外面那个独占事务做掉了：并发的第二条切换根本进不到这一行。
 *
 * 所以调用点的义务反过来：**必须**在切换事务里调它，且只调一次。漏掉这一步的代价是
 * `main → feature → main` 走一个来回之后 revision 原地不动，于是走之前捕获的 token
 * 在走回来之后仍然校验通过——`findCommitConflict()` 的第一位仲裁位就此变成常数。
 *
 * `rowsAffected !== 1` 当场抛，不静默走过去：激活态是单例行，它不在意味着装载期迁移没跑完，
 * 而放行等于让接下来整条切换在一个没有仲裁位的库上完成，事后无从分辨。
 */
export const advanceActivationRevision = async (executor: TransactionExecutor): Promise<void> => {
  const { rowsAffected } = await executor.query(buildActivationAdvance(executor.tableRef(WorkingTreeActivationState)));
  if (rowsAffected === 1) return;
  throw new RxDBError(
    `推进 activation revision 时命中 ${rowsAffected} 行，期望恰好 1 行：` +
      '激活态是单例行，它不在意味着迁移 0004-working-tree-commits 没跑完。' +
      '这不是「没什么要推进的」，不能按成功继续——那会让这条分支切换在一个没有代际仲裁位的库上完成。'
  );
};
