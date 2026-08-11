import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterSqliteai } from '../RxDBAdapterSqliteai.js';
import type { SqliteaiOptions } from '../sqliteai.interface.js';

class QueryCountingSqliteaiAdapter extends RxDBAdapterSqliteai {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterSqliteai['query']>): ReturnType<RxDBAdapterSqliteai['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

const silentPrintErr = (): void => undefined;
const workers = new WeakMap<RxDB, Worker>();

const terminateWorker = (rxdb: RxDB): void => {
  const worker = workers.get(rxdb);
  if (!worker) return;
  workers.delete(rxdb);
  worker.terminate();
};

export const sqliteaiFactory: AdapterFactory = {
  name: 'sqliteai',

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteaiAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteClient(dbName, {
      printErr: silentPrintErr,
      ...(options as SqliteaiOptions)
    })) as T;
  },

  cleanupAdapter(adapter): void {
    terminateWorker(adapter.rxdb);
  }
};

async function createSqliteaiAdapter(options?: Record<string, unknown>): Promise<QueryCountingSqliteaiAdapter> {
  const rawOptions = (options ?? {}) as SqliteaiOptions & { entities?: EntityType[]; persistent?: boolean };
  const { entities: entitiesOption, persistent, ...adapterOptions } = rawOptions;
  const entities = (entitiesOption ?? []).slice();
  const dbName = `sqliteai-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: 'sqliteai' },
      type: SyncType.None
    }
  });
  try {
    let countingAdapter: QueryCountingSqliteaiAdapter | undefined;
    rxdb.adapter('sqliteai', async db => {
      terminateWorker(db);
      const worker =
        persistent === true ?
          new Worker(new URL('./sqliteai-test.worker', import.meta.url), {
            type: 'module',
            name: `${dbName}-worker`
          })
        : undefined;
      if (worker) workers.set(db, worker);
      countingAdapter = new QueryCountingSqliteaiAdapter(db, {
        ...(worker ?
          { opfs: true, opfsFallback: 'throw' as const, worker: true, workerInstance: worker }
        : { printErr: silentPrintErr }),
        ...adapterOptions
      });
      return countingAdapter;
    });
    await rxdb.getAdapter('sqliteai');
    await rxdb.connect('sqliteai');
    return countingAdapter!;
  } catch (error) {
    terminateWorker(rxdb);
    throw error;
  }
}

export const sqliteaiEncryptedFactory: EncryptedAdapterFactory = {
  name: 'sqliteai',
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createSqliteaiAdapter(options);
    encryptedQueryCounts.set(adapter, () => adapter.queryCount);
    return adapter;
  }
};
