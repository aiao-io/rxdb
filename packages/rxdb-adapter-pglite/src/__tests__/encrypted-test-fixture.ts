/**
 * PGlite 共享测试夹具：加密套件用的适配器工厂与内存库转储器。
 *
 * @remarks
 * 方言改写、查询形状包装与整库转储三件事已经上移到发布入口 `../testing.js`——
 * Electron 那份桌面 PGlite 工厂要跑的是同一批套件，helper 留在 `__tests__` 里它就够不着，
 * 只能复制一份；复制出来的两份一旦漂移，「桌面与浏览器行为一致」这句话就失去机械保证。
 * 本文件因此只剩下 PGlite 浏览器档位**独有**的那部分：怎么造适配器。
 */
import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { EncryptedAdapterFactory, EncryptedTestAdapter } from '@aiao/rxdb-test/encrypted';
import type { Results } from '@electric-sql/pglite';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { dumpPGliteUserTables, wrapEncryptedQueryShape } from '../testing.js';

class QueryCountingPGliteAdapter extends RxDBAdapterPGlite {
  queryCount = 0;

  override query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    this.queryCount++;
    return super.query<T>(sql, bindings);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

export const pgliteFactory: EncryptedAdapterFactory = {
  name: 'pglite',
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,

  async createAdapter(options?: Record<string, unknown>): Promise<EncryptedTestAdapter> {
    const entities = ((options?.['entities'] as EntityType[]) ?? []).slice();
    const dbName = `pg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities,
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    let countingAdapter: QueryCountingPGliteAdapter | undefined;
    rxdb
      .adapter('pglite', async db => {
        countingAdapter = new QueryCountingPGliteAdapter(db, { store: 'memory' });
        return countingAdapter;
      })
      .init();

    await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
    if (!countingAdapter) throw new Error('pglite adapter factory did not create an adapter');
    const adapter = countingAdapter;
    const wrapped = wrapEncryptedQueryShape(adapter) as unknown as EncryptedTestAdapter;
    encryptedQueryCounts.set(wrapped, () => adapter.queryCount);
    return wrapped;
  }
};

/**
 * 测试中的 PGlite 使用内存存储。转储非系统 schema 中的所有用户表，
 * 覆盖实体行、`rxdb_change` 日志、缓存快照和 keyring。
 */
export async function readPGliteDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  return dumpPGliteUserTables(adapter);
}
