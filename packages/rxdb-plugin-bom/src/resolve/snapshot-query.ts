import type { TransactionExecutor } from '@aiao/rxdb';

/**
 * 在一次只读事务中复用相同 SQL 与参数的查询结果，每个事务必须独立创建。
 *
 * @param query - 已绑定当前执行器的只读查询
 * @returns 保留原始失败的事务内查询
 */
export const memoizeBomSnapshotQuery = (query: TransactionExecutor['query']): TransactionExecutor['query'] => {
  const reads = new Map<string, ReturnType<TransactionExecutor['query']>>();
  return (sql, params) => {
    const key = JSON.stringify([sql, params ?? []]);
    let result = reads.get(key);
    if (result === undefined) {
      result = query(sql, params);
      reads.set(key, result);
    }
    return result;
  };
};
