import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { runTreeSiblingUniqueSuite, type TreeUniqueSuiteFactory } from '@aiao/rxdb-test/tree-unique';
import { getTableNameByMetadata } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 树形实体「同级唯一」契约（RXT-010 / RXT-016）的 PGlite runner。
 *
 * @remarks
 * 与 sqlite 侧的 runner 同一口径 —— 唯一约束由建表 DDL 承担，
 * 两处 DDL 生成实现（sqlite-core 与 PGlite）必须给出同样的行为。
 */
const ADAPTER_NAME = 'pglite';

const factory: TreeUniqueSuiteFactory = {
  name: ADAPTER_NAME,
  createDatabase: async ({ dbName, entities }) => {
    let adapter: RxDBAdapterPGlite | undefined;
    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...entities],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    rxdb.adapter(ADAPTER_NAME, async database => {
      adapter = new RxDBAdapterPGlite(database, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect(ADAPTER_NAME);

    return {
      rxdb,
      countRows: async entity => {
        if (!adapter) throw new Error('adapter is not created yet');
        const table = getTableNameByMetadata(getEntityMetadata(entity));
        const result = (await adapter.query(`SELECT COUNT(*)::int AS count FROM ${table}`)) as {
          rows: ReadonlyArray<{ count: number }>;
        };
        return result.rows[0].count;
      },
      dispose: async () => {
        await rxdb.disconnectAll().catch(() => undefined);
      }
    };
  }
};

runTreeSiblingUniqueSuite({ factory });
