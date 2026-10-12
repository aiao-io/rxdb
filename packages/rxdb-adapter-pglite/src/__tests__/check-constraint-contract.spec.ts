import { RxDB, SyncType } from '@aiao/rxdb';
import {
  runCheckConstraintWriteBehaviorSuite,
  type CheckConstraintSuiteFactory
} from '@aiao/rxdb-test/check-constraint';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * CHECK 违约写入被拒（US-030 AC#1 / #2 / #8）的 PGlite runner。
 *
 * @remarks
 * 与 sqlite 侧的 runner 同一口径——CHECK 由建表 DDL 承担，
 * 两处 DDL 生成实现（sqlite-core 与 PGlite）必须给出同样的行为与归一后的错误类。
 */
const factory: CheckConstraintSuiteFactory = {
  name: 'pglite',
  createDatabase: async ({ dbName, entities }) => {
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async database => {
      return new RxDBAdapterPGlite(database, { store: 'memory' });
    });
    await rxdb.connect('pglite');
    return {
      rxdb,
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runCheckConstraintWriteBehaviorSuite({ factory });
