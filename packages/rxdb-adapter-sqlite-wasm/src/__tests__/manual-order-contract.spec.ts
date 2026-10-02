import { RxDB, SyncType } from '@aiao/rxdb';
import { type ManualOrderSuiteFactory, runManualOrderSuite } from '@aiao/rxdb-test/sortable';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * 手动排序契约（US-028 阶段 A）的 SQLite runner。
 *
 * @remarks
 * sqlite / wa-sqlite / sqliteai / sqlite-wasm 共用 `RxDBAdapterSqliteBase` 与 sqlite-core 的查询 SQL，
 * 这里覆盖共享实现；PGlite 侧另有同名 runner，两端须对同一份数据给出同一个码点序。
 */
const ADAPTER_NAME = 'sqlite-wasm';

const factory: ManualOrderSuiteFactory = {
  name: ADAPTER_NAME,
  createDatabase: async ({ dbName, entities }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    rxdb.adapter(
      ADAPTER_NAME,
      async database => new RxDBAdapterSqlite(database, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl })
    );
    await rxdb.connect(ADAPTER_NAME);
    return {
      rxdb,
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runManualOrderSuite({ factory });
