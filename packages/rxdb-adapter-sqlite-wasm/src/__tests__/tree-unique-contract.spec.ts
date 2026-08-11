import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { get_table_name_by_metadata, quote_sql_identifier } from '@aiao/rxdb-adapter-sqlite-core';
import { runTreeSiblingUniqueSuite, type TreeUniqueSuiteFactory } from '@aiao/rxdb-test/tree-unique';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * 树形实体「同级唯一」契约（RXT-010 / RXT-016）的 SQLite runner。
 *
 * @remarks
 * sqlite / wa-sqlite / sqliteai / sqlite-wasm 共用 `RxDBAdapterSqliteBase` 与
 * sqlite-core 的建表 SQL，这里覆盖共享实现；PGlite 侧另有同名 runner，
 * 两套 DDL 生成实现必须给出同样的行为。
 */
const ADAPTER_NAME = 'sqlite-wasm';

const factory: TreeUniqueSuiteFactory = {
  name: ADAPTER_NAME,
  createDatabase: async ({ dbName, entities }) => {
    let adapter: RxDBAdapterSqlite | undefined;
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    rxdb.adapter(ADAPTER_NAME, async database => {
      adapter = new RxDBAdapterSqlite(database, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl });
      return adapter;
    });
    await rxdb.connect(ADAPTER_NAME);

    return {
      rxdb,
      countRows: async entity => {
        if (!adapter) throw new Error('adapter is not created yet');
        const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(entity)));
        const result = await adapter.query(`SELECT COUNT(*) AS count FROM ${table};`);
        return Number(result.results[0].rows[0][0]);
      },
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runTreeSiblingUniqueSuite({ factory });
