import { RxDB, SyncType } from '@aiao/rxdb';
import {
  runCheckConstraintWriteBehaviorSuite,
  type CheckConstraintSuiteFactory
} from '@aiao/rxdb-test/check-constraint';
import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

/**
 * CHECK 违约写入被拒（US-030 AC#1 / #2 / #8）的 wa-sqlite runner。
 *
 * @remarks
 * wa-sqlite 是 SQLite family 的共享套件宿主：行为来自 sqlite-core 共享层的
 * DDL 生成与错误归一化，其他宿主（sqlite-wasm / sqliteai / node / tauri）走同一层。
 */
const factory: CheckConstraintSuiteFactory = {
  name: 'wa-sqlite',
  createDatabase: async ({ dbName, entities }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
    });
    rxdb.adapter('wa-sqlite', async db => {
      return new RxDBAdapterWaSqlite(db, {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      });
    });
    await rxdb.connect('wa-sqlite');
    return {
      rxdb,
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runCheckConstraintWriteBehaviorSuite({ factory });
