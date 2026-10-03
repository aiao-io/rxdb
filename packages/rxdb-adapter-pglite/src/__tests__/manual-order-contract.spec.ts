import { RxDB, SyncType } from '@aiao/rxdb';
import { type ManualOrderSuiteFactory, runManualOrderSuite } from '@aiao/rxdb-test/sortable';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 手动排序契约（US-028 阶段 A）的 PGlite runner。
 *
 * @remarks
 * 与 sqlite-wasm 侧的 runner 对同一份数据断言同一个码点序期望：PGlite 靠 `sortOrder` 上显式的
 * `COLLATE "C"`，SQLite 靠 TEXT 默认的 BINARY，两边各自等于期望即两端同序。
 */
const ADAPTER_NAME = 'pglite';

const factory: ManualOrderSuiteFactory = {
  name: ADAPTER_NAME,
  createDatabase: async ({ dbName, entities }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    rxdb.adapter(ADAPTER_NAME, async database => new RxDBAdapterPGlite(database, { store: 'memory' }));
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
