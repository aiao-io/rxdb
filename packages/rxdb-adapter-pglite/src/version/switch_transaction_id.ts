import type { UUID } from '@aiao/rxdb';

export interface PGliteTransactionIdStatement {
  readonly sql: string;
  readonly params: [UUID];
}

/**
 * 生成事务局部的变更日志上下文。
 *
 * `is_local = true` 让 PostgreSQL 在提交或回滚时自动清理该值，不需要额外恢复语句。
 *
 * @param transactionId - 当前日志事务 ID
 * @returns 参数化 SQL 与绑定值
 */
export default function rxdb_adapter_switch_transaction_id(transactionId: UUID): PGliteTransactionIdStatement {
  return {
    sql: "SELECT set_config('rxdb.transaction_id', $1::text, true)",
    params: [transactionId]
  };
}
