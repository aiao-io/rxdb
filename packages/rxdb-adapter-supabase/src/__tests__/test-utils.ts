import { getEntityMetadata, RxDBChange, RxDBSync } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-wa-sqlite';

export const LOCAL_RXDB_CHANGE_TABLE = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBChange));
export const LOCAL_RXDB_SYNC_TABLE = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBSync));

interface SqliteAdapterTestApi {
  rxdb?: { entityManager?: { cleanAllCache?: () => void } };
  internalQuery?: (sql: string) => Promise<unknown>;
}

/**
 * 清理 SQLite 适配器数据
 * 用于测试环境重置数据库状态
 */
export async function cleanupSqliteAdapter(adapter: RxDBAdapterWaSqlite): Promise<void> {
  try {
    const sqlite = adapter as unknown as RxDBAdapterWaSqlite & SqliteAdapterTestApi;

    if (typeof adapter.cleanAllCache === 'function') {
      await adapter.cleanAllCache();
    }
    if (sqlite.rxdb?.entityManager?.cleanAllCache) {
      sqlite.rxdb.entityManager.cleanAllCache();
    }

    if (typeof sqlite.internalQuery === 'function') {
      await sqlite.internalQuery('DELETE FROM public$todos');
      await sqlite.internalQuery(`DELETE FROM ${LOCAL_RXDB_CHANGE_TABLE}`);
      await sqlite.internalQuery(`DELETE FROM ${LOCAL_RXDB_SYNC_TABLE}`);
    }
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}
