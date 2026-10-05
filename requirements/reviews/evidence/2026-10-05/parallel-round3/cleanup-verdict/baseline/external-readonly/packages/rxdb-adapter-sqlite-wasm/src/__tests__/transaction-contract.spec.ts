import { RxDB, SyncType } from '@aiao/rxdb';
import {
  runBootstrapAtomicitySuite,
  runReadinessSuite,
  runTransactionIsolationSuite,
  type TransactionAdapterLike,
  type TransactionSuiteFactory
} from '@aiao/rxdb-test/transaction';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * 事务契约套件（C1 就绪门 / C2 事务作用域 / C3 引导事务）的 SQLite runner。
 *
 * @remarks
 * sqlite / wa-sqlite / sqliteai 与 sqlite-wasm 共用 `RxDBAdapterSqliteBase`，这里覆盖共享实现。
 */
const ADAPTER_NAME = 'sqlite-wasm';

const factory: TransactionSuiteFactory = {
  name: ADAPTER_NAME,
  noopSql: 'SELECT 1;',
  createDatabase: async ({ dbName, entities, migrations }) => {
    let adapter: RxDBAdapterSqlite | undefined;
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None },
      ...(migrations ? { migrations: [...migrations] } : {})
    });
    rxdb.adapter(ADAPTER_NAME, async database => {
      adapter = new RxDBAdapterSqlite(database, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl });
      return adapter;
    });

    return {
      rxdb,
      adapterName: ADAPTER_NAME,
      // 套件只消费 executor 的公共最小结构，不依赖 SQLite 扩展方法。
      adapter: () => {
        if (!adapter) throw new Error('adapter is not created yet; call rxdb.connect() first');
        return adapter as unknown as TransactionAdapterLike;
      },
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  },
  createBootstrapProbe: async ({ dbName, entities }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    const adapter = new RxDBAdapterSqlite(rxdb, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl });
    await adapter.connect();
    return {
      createTables: (EntityTypes, initialEntities) => adapter.createTables(EntityTypes, initialEntities),
      tableExists: EntityType => adapter.isTableExisted(EntityType),
      dispose: () => adapter.disconnect()
    };
  }
};

runReadinessSuite({ factory });
runBootstrapAtomicitySuite({ factory });
runTransactionIsolationSuite({ factory });
