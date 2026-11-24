import type { CountOptions } from '../repository/query-options.interface.js';
import type { RxDBChange } from '../system/change.js';
import type { RxDBChangeRuleGroup } from '../system/types.js';

/**
 * 按条件数变更行。
 *
 * @remarks
 * 实体仓储的 `count()` 是活查询（`Observable`），适配器仓储的是 `Promise`，调用方各自包成这个形状交进来。
 * 分组计数（`groupBy`）返回分组个数，由本地适配器执行。
 */
export type RxDBChangeCounter = (options: CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>) => Promise<number>;

/**
 * 数变更日志里的记录：同一事务里的变更算一条，不在事务里的变更各算一条。
 *
 * @param count - 按条件数变更行
 * @param where - 要数的那批变更
 * @returns 记录条数
 * @throws 透传 `count` 的错误
 *
 * @remarks
 * 一次 `saveMany()` 在一个事务里落库，操作历史里是一条「事务: 创建10条」，待推数也按这个口径：
 * 批量添加 10 条是 1 条记录。分组计数会把 `transactionId` 为空的行并成一组，所以分两次数。
 *
 * @example
 * ```ts
 * const records = await countRxDBChangeRecords(
 *   options => firstValueFrom(rxdb.entityManager.getRepository(RxDBChange).count(options)),
 *   { combinator: 'and', rules: [{ field: 'remoteId', operator: '=', value: null }] }
 * );
 * ```
 */
export async function countRxDBChangeRecords(count: RxDBChangeCounter, where: RxDBChangeRuleGroup): Promise<number> {
  const [standalone, transactions] = await Promise.all([
    count({ where: { combinator: 'and', rules: [where, { field: 'transactionId', operator: '=', value: null }] } }),
    count({
      where: { combinator: 'and', rules: [where, { field: 'transactionId', operator: '!=', value: null }] },
      groupBy: ['transactionId']
    })
  ]);
  return standalone + transactions;
}
