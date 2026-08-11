import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqliteOfficial.js';
import type { SqliteOptions } from '../sqlite-official.interface.js';

class QueryCountingSqliteOfficialAdapter extends RxDBAdapterSqlite {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterSqlite['query']>): ReturnType<RxDBAdapterSqlite['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

const workers = new WeakMap<RxDB, Worker>();

const terminateWorker = (rxdb: RxDB): void => {
  const worker = workers.get(rxdb);
  if (!worker) return;
  workers.delete(rxdb);
  worker.terminate();
};

export const sqliteOfficialFactory: AdapterFactory = {
  name: 'sqlite',

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteOfficialAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteClient(dbName, { ...(options as SqliteOptions) })) as T;
  },

  cleanupAdapter(adapter): void {
    terminateWorker(adapter.rxdb);
  }
};

async function createSqliteOfficialAdapter(
  options?: Record<string, unknown>
): Promise<QueryCountingSqliteOfficialAdapter> {
  const rawOptions = (options ?? {}) as { entities?: EntityType[]; persistent?: boolean };
  const entities = (rawOptions.entities ?? []).slice();
  const persistent = rawOptions.persistent === true;
  const dbName = `sqlite-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: 'sqlite' },
      type: SyncType.None
    }
  });
  try {
    let countingAdapter: QueryCountingSqliteOfficialAdapter | undefined;
    rxdb.adapter('sqlite', async db => {
      terminateWorker(db);
      const worker =
        persistent ?
          new Worker(new URL('./sqlite-official-test.worker', import.meta.url), {
            type: 'module',
            name: `${dbName}-worker`
          })
        : undefined;
      if (worker) workers.set(db, worker);
      countingAdapter = new QueryCountingSqliteOfficialAdapter(db, {
        batchTimeout: 1,
        ...(worker ? { opfs: true, opfsFallback: 'throw' as const, worker: true, workerInstance: worker } : {})
      });
      return countingAdapter;
    });
    await rxdb.getAdapter('sqlite');
    await rxdb.connect('sqlite');
    return countingAdapter!;
  } catch (error) {
    terminateWorker(rxdb);
    throw error;
  }
}

export const sqliteOfficialEncryptedFactory: EncryptedAdapterFactory = {
  name: 'sqlite',
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createSqliteOfficialAdapter(options);
    encryptedQueryCounts.set(adapter, () => adapter.queryCount);
    return adapter;
  }
};
