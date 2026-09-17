/**
 * @fileoverview 恢复会话的终态转换（FR-015、FR-034、US-307 AC4/AC5）
 *
 * @remarks
 * 会话是一行**库表**而不是一个内存标记（data-model.md §2.8），于是「这次恢复结束了」
 * 也必须自己落一次盘。落盘的时机只有一个正确答案：与结束它的那次写入**同一个事务**——
 * 本模块两个入口因此都只收一个 {@link TransactionExecutor}，一律不自己开事务。
 *
 * 四件事在这里被钉死：
 *
 * 1. **commit 走 UPDATE、discard 走 DELETE，不是同一个终态的两种叫法。** US-307
 *    「discard 成功后删除 session」给的是删除；状态枚举里没有 `discarded`，把丢弃也记成
 *    `committed` 是一句假话——什么都没提交，而「这个分支上提交过几次恢复」从此永远数不对。
 * 2. **`status` 与 `activeKey` 在同一条 UPDATE 里改。** 两者中间那一刻，库里要么是
 *    「已 committed 却仍占着 `activeKey`」（唯一索引挡住下一次 restore），要么是
 *    「还 active 却已经让出唯一键」（两个会话同时活着）。与 `working-tree-state-sql.ts`
 *    对 `workingTreeRevision` / `entryCount` 的要求同一条理由，也同一种手法：裸 SQL。
 * 3. **先读后写，读不到就一条语句都不发。** 绝大多数提交发生在没有恢复会话的分支上；
 *    「反正 WHERE 匹配不到，无脑发一条」给每一次普通提交都加上一次不必要的往返。
 *    而且那一次读本来就非做不可——事务内已被读出来的行要跟着一起改，否则同一个事务里
 *    后续的 `status()` 仍然会看见一个 active 会话（见第 4 条）。
 * 4. **写完 SQL 之后同步内存里那一行。** ORM 读出来的是行对象，裸 SQL 改的是库里的行；
 *    不同步的话，同一事务内紧接着跑的 `readRestoreBits()` 会读到旧值，于是一次刚刚成功的
 *    提交立刻报出 `conflicted`——因为它推进的两个 revision 与会话捕获的那一对已经不同了。
 *
 * **不在这里做 CAS 分支。** 会话的 CAS 由上游那次提交/丢弃的 revision CAS 覆盖：能结束
 * 这个会话的只有 commit 与 discard，而两者都会推进 `workingTreeRevision`，于是任何一个
 * 并发的结束者都必然先让调用方手里那个捕获值失效（FR-034）。在这里再判一次
 * `rowsAffected`，加出来的是一条在事务里走不到的分支——走不到就测不到，测不到的分支
 * 与兜底没有区别。
 */

import type { EntityMetadata, TransactionExecutor } from '@aiao/rxdb';
import { getEntityColumnName, getEntityMetadata, quoteSqlIdentifier, RxDBError, sqlStringLiteral } from '@aiao/rxdb';
import { WorkingTreeRestoreSession } from './working-tree-restore-session.entity.js';

/** 拼终态 UPDATE 用得上的那三列。 */
type RestoreSessionColumn = 'id' | 'status' | 'activeKey';

/** 取一列的真实列名并加引号；取不到就抛——`undefined` 会安静地拼出一条语法错误的语句。 */
const columnOf = (metadata: EntityMetadata, field: RestoreSessionColumn): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`WorkingTreeRestoreSession 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/**
 * 拼一条「会话转 `committed` 并让出 `activeKey`」的单语句。
 *
 * @remarks
 * WHERE 带 `activeKey IS NOT NULL` 不是第二次 CAS，而是这条语句的**作用域**：它保证
 * 语句永远只可能命中未结束的那一行，重复执行不会把一行早已结束的会话再「结束」一次，
 * 也不会在 `id` 因为任何原因写错时改到别的分支的历史会话上。
 */
const buildRestoreSessionCommitSql = (tableRef: string, sessionId: string): string => {
  const metadata = getEntityMetadata(WorkingTreeRestoreSession);
  return [
    `UPDATE ${tableRef}`,
    `SET ${columnOf(metadata, 'status')} = ${sqlStringLiteral('committed')},`,
    `${columnOf(metadata, 'activeKey')} = NULL`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(sessionId)}`,
    `AND ${columnOf(metadata, 'activeKey')} IS NOT NULL`
  ].join(' ');
};

/**
 * 读当前分支那一行未结束的恢复会话。
 *
 * @param executor - 调用方那个事务的执行器
 * @param branchId - 目标分支
 * @returns 命中的会话行；没有未结束会话时 `null`
 *
 * @remarks
 * 判据是 **`activeKey` 非空**，不是 `status !== 'committed'`：唯一索引建在
 * `activeKey` 上，「一分支至多一个未结束会话」这句话的执行者是它，读的口径跟着写的口径走
 * 才不会分岔。把终态行也算进来的话，一个分支只要恢复过一次，此后它永远显示恢复中。
 *
 * 全库只此一份：`status.ts` 的 `readRestoreBits()`、`restore-command.ts` 的
 * `readActiveRestoreSession()` 与本模块两个终态入口读的都是它。四份各写一遍 where 的话，
 * 迟早有一份漏掉 `branchId`——而那一份会在单分支的库上永远绿。
 */
export const readActiveRestoreSessionRow = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<WorkingTreeRestoreSession | null> => {
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
  return session ?? null;
};

/**
 * 提交收尾：把当前分支未结束的恢复会话推进 `committed`（FR-015）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param branchId - 目标分支
 * @returns 被结束掉的会话 id；这个分支上本来就没有未结束会话时 `null`
 *
 * @remarks
 * 调用点在 `commit-command.ts` › `finishCommit`，且**排在提交确实落库之后**：反过来
 * 先结束会话再写 commit，CAS 落空时留下的是一个指向从未发生过的提交的终态会话，
 * 而恢复结果还原封不动地躺在工作树里，没有任何入口会再去修它。
 *
 * 幂等重放（`writeCommit` 的 `reused` 出口）**不经过这里**：那次调用什么都没写，
 * 真正结束这个会话的那次提交早已在它自己的事务里做过这件事。
 */
export const commitActiveRestoreSession = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<string | null> => {
  const session = await readActiveRestoreSessionRow(executor, branchId);
  if (!session) return null;

  await executor.query(buildRestoreSessionCommitSql(executor.tableRef(WorkingTreeRestoreSession), session.id));
  session.status = 'committed';
  session.activeKey = null;
  return session.id;
};

/**
 * 丢弃收尾：把当前分支未结束的恢复会话整行删掉（US-307 AC5）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param branchId - 目标分支
 * @returns 被删掉的会话 id；这个分支上本来就没有未结束会话时 `null`
 *
 * @remarks
 * 调用点在 `discard-command.ts`，排在条目删除与状态行 UPDATE 之后——与 commit 一侧同理，
 * 会话只在工作树确实回到 HEAD 之后才结束。
 *
 * **删除而不是标成终态**：丢弃没有产生任何 commit，给它一行 `committed` 会让
 * 「这个分支上提交过几次恢复」永远数不对；而状态枚举里没有 `discarded`，加一个值
 * 等于让 `status().conflicted` 的口径多一种要考虑的形态，换来的只是一行没人会查的墓碑。
 *
 * 语义 no-op 的丢弃（工作树本来就是空的）**走不到这里**：那条路径一条写语句都不发
 * （`discard-command.ts` 的第 2 条）。工作树空着却还有未结束会话的库也不存在——能把条目
 * 清空的只有 commit 与 discard，而两者都会顺手结束会话。
 */
export const discardActiveRestoreSession = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<string | null> => {
  const session = await readActiveRestoreSessionRow(executor, branchId);
  if (!session) return null;

  await executor.removeMany([session]);
  return session.id;
};
