/**
 * @fileoverview 并发追加用例的事务屏障（US-028）。
 */
import type { LocalRxDBAdapter } from '@aiao/rxdb';

/**
 * 让两次写入都已请求事务、谁也还没开始读锚点时才放行，读写交错固定为最坏情形。
 *
 * @param adapter - 被测本地主适配器；期间临时替换它的 `transaction`，结束后还原
 * @param run - 发起并发写入
 * @returns 屏障期间到达的事务请求数
 *
 * @remarks
 * 能保证不撞键的只剩适配器事务自身的串行化。
 */
export const withTransactionBarrier = async (
  adapter: LocalRxDBAdapter,
  run: () => Promise<unknown>
): Promise<number> => {
  const transaction = adapter.transaction.bind(adapter);
  let arrived = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => (release = resolve));
  adapter.transaction = (async (fun: Parameters<typeof transaction>[0], log?: boolean) => {
    arrived += 1;
    if (arrived === 2) release();
    await barrier;
    return transaction(fun, log);
  }) as typeof adapter.transaction;
  try {
    await run();
  } finally {
    adapter.transaction = transaction;
  }
  return arrived;
};
