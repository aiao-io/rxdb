import { RXDB_UPGRADE_GUARD_TABLE_NAME, RXDB_WRITER_LEASE_TABLE_NAME, type RxDB } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { SqliteGraphRepository } from '../sqlite/SqliteGraphRepository.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

/**
 * writer lease 协议表：持久化 across 整个测试文件的 writer epoch，一旦被清空即永久 fenced。
 * 必须与 RxDBAdapterSqliteBase 内部的表名拼接规则（`rxdb$${name}`）保持一致。
 */
const WRITER_LEASE_PROTOCOL_TABLES = new Set([
  `rxdb$${RXDB_UPGRADE_GUARD_TABLE_NAME}`,
  `rxdb$${RXDB_WRITER_LEASE_TABLE_NAME}`
]);

export const create_graph_test_adapter = (rxdb: RxDB): RxDBAdapterWaSqlite =>
  new RxDBAdapterWaSqlite(rxdb, {
    vfs: 'MemoryAsyncVFS',
    async: true,
    worker: false,
    wasmPath: asyncWasmPath,
    batchTimeout: 1,
    repositories: {
      GraphRepository: SqliteGraphRepository
    }
  });

export const cleanup_db = async (adapter: RxDBAdapterWaSqlite) => {
  adapter.rxdb.entityManager.cleanAllCache();
  adapter.cleanAllCache();

  await adapter.transaction(async tx => {
    await tx.execute('PRAGMA defer_foreign_keys = ON;');

    const tableNameResult = await tx.execute(`SELECT name FROM sqlite_master WHERE type='table';`);
    for (let i = 0; i < tableNameResult.results[0].rows.length; i++) {
      const tableName = tableNameResult.results[0].rows[i][0] as string;
      if (tableName.startsWith('sqlite_') || WRITER_LEASE_PROTOCOL_TABLES.has(tableName)) {
        continue;
      }
      await tx.execute(`DELETE FROM "${tableName}";`);
    }

    try {
      await tx.execute(
        `INSERT INTO "rxdb$rxdb_branch" (id,activated,fromChangeId,local,remote) VALUES ('main',1,NULL,1,0);`
      );
    } catch {
      //
    }
  }, false);

  adapter.rxdb.entityManager.cleanAllCache();
  adapter.cleanAllCache();
};
