/**
 * 事务契约套件（C1 就绪门 / C2 事务作用域 / C3 引导事务）的桌面 PGlite runner。
 *
 * @remarks
 * 覆盖 US-208 AC#2（事务语义跨进程保持）与 AC#4（与浏览器档位行为一致）。
 *
 * 与 `packages/rxdb-adapter-pglite/src/__tests__/transaction-contract.spec.ts` 是**同一套**
 * 断言，差别只在工厂：那边 `store: 'memory'` 直连 PGlite，这边每条用例都要穿过
 * 「客户端 → 协议校验 → host → 磁盘上的 PGlite」的完整链路。事务在桌面档位下是被
 * 拆成 `begin` / `exec` / `commit` / `rollback` 四条独立请求跨进程送出去的，
 * 「作用域由 executor 对象标识表示」这件事因此不再是进程内的语言保证，必须真跑一遍。
 *
 * 每条用例各建一个 `dbName` ⇒ 各落一棵数据目录树（`<dbName>-pgdata`），互不串味；
 * 整棵工作区由 {@link stopElectronPgliteTestHost} 在收尾时删掉。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import {
  runBootstrapAtomicitySuite,
  runReadinessSuite,
  runTransactionIsolationSuite,
  type TransactionAdapterLike,
  type TransactionSuiteFactory
} from '@aiao/rxdb-test/transaction';
import { afterAll } from 'vitest';
import { ADAPTER_NAME } from '../pglite/pglite-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../pglite/RxDBAdapterElectronPGlite.js';
import { electronPgliteTransport, stopElectronPgliteTestHost } from './electron-pglite-adapter-factory.js';

const factory: TransactionSuiteFactory = {
  name: ADAPTER_NAME,
  noopSql: 'SELECT 1;',
  createDatabase: async ({ dbName, entities, migrations }) => {
    let adapter: RxDBAdapterElectronPGlite | undefined;
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None },
      ...(migrations ? { migrations: [...migrations] } : {})
    });
    rxdb.adapter(ADAPTER_NAME, async database => {
      adapter = new RxDBAdapterElectronPGlite(database, { transport: electronPgliteTransport() });
      return adapter;
    });

    return {
      rxdb,
      adapterName: ADAPTER_NAME,
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
    const adapter = new RxDBAdapterElectronPGlite(rxdb, { transport: electronPgliteTransport() });
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

afterAll(async () => {
  await stopElectronPgliteTestHost();
});
