import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import {
  runCheckConstraintWriteBehaviorSuite,
  runConditionalUniqueWriteBehaviorSuite,
  runExclusionWriteBehaviorSuite,
  type CheckConstraintSuiteFactory
} from '@aiao/rxdb-test/check-constraint';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 声明式存储约束（US-030：CHECK AC#1 / #2 / #8、条件唯一 AC#3、区间排他 AC#4 / #12 / #13 / #14）的 PGlite runner。
 *
 * @remarks
 * 与 sqlite 侧的 runner 同一口径——约束由建表 DDL 承担（区间排他在 PG 是 `EXCLUDE USING gist`），
 * 两处 DDL 生成实现（sqlite-core 与 PGlite）必须给出同样的行为与归一后的错误类。
 */
const factory: CheckConstraintSuiteFactory = {
  name: 'pglite',
  createDatabase: async ({ dbName, entities, history }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async database => {
      return new RxDBAdapterPGlite(database, { store: 'memory' });
    });
    // 区间排他的 AC#14 要走 undo / redo 与切分支重放
    if (history) rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
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
