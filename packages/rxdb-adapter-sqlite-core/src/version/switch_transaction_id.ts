import { getEntityMetadata, UUID } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { generate_table_trigger_sql } from '../table/trigger_sql.js';

/**
 * 切换分支版本
 * @param adapter SQLite 适配器
 * @param branchId 分支 ID
 * @param transactionId 事务 ID
 */
export const switch_transaction_id = (adapter: RxDBAdapterSqliteBase, branchId: string, transactionId?: UUID) => {
  let sql = '';
  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);
    if (metadata.log !== false) {
      const trigger_sql = generate_table_trigger_sql(metadata, {
        branchId,
        transactionId,
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      });
      sql += '\n' + trigger_sql;
    }
  });

  return sql;
};
