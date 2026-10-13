import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import {
  runCheckConstraintWriteBehaviorSuite,
  runConditionalUniqueWriteBehaviorSuite,
  runExclusionWriteBehaviorSuite,
  type CheckConstraintSuiteFactory
} from '@aiao/rxdb-test/check-constraint';
import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

/**
 * 声明式存储约束（US-030：CHECK AC#1 / #2 / #8、条件唯一 AC#3、区间排他 AC#4 / #12 / #13 / #14）的 wa-sqlite runner。
 *
 * @remarks
 * wa-sqlite 是 SQLite family 的共享套件宿主：行为来自 sqlite-core 共享层的
 * DDL 生成与错误归一化，其他宿主（sqlite-wasm / sqliteai / node / tauri）走同一层。
 */
const factory: CheckConstraintSuiteFactory = {
  name: 'wa-sqlite',
  createDatabase: async ({ dbName, entities, history }) => {
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
    // 区间排他的 AC#14 要走 undo / redo 与切分支重放
    if (history) rxdb.use(rxDBPluginHistory);
    await rxdb.connect('wa-sqlite');
    return {
      rxdb,
      versionManager: history ? rxdb.versionManager : undefined,
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runCheckConstraintWriteBehaviorSuite({ factory });
runConditionalUniqueWriteBehaviorSuite({ factory });
runExclusionWriteBehaviorSuite({ factory });
