/**
 * 事务契约套件共用的 teardown。
 *
 * @remarks
 * 不经 `index.ts` 导出：只服务三份套件的 `afterEach`，不是公开 API。
 */
import type { TransactionSuiteDatabase } from './types.js';

/**
 * 清空并释放本用例打开过的全部数据库。
 *
 * @remarks
 * 每个库都必须被 dispose 一次——一个失败不能让其余的漏关，所以先 `allSettled` 收齐。
 * 但失败**不得吞掉**：dispose 拒绝说明适配器释放路径坏了，吞掉后套件对这类回归没有判别力。
 * 单个失败原样抛出，多个失败合并成 `AggregateError`。
 *
 * @param opened - 套件登记的已打开库；调用后被清空
 */
export const disposeOpened = async (opened: TransactionSuiteDatabase[]): Promise<void> => {
  const pending = opened.splice(0, opened.length);
  const settled = await Promise.allSettled(pending.map(database => database.dispose()));
  const failures = settled.flatMap(result => (result.status === 'rejected' ? [result.reason] : []));
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, `${failures.length} 个数据库 dispose 失败`);
};
