import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';
import type { SqliteOptions } from '../sqlite.interface.js';

class QueryCountingSqliteWasmAdapter extends RxDBAdapterSqlite {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterSqlite['query']>): ReturnType<RxDBAdapterSqlite['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

export const sqliteWasmFactory: AdapterFactory = {
  name: 'sqlite-wasm',

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteWasmAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteClient(dbName, {
      vfs: 'memory',
      wasmUrl: sqliteWasmUrl,
      ...(options as SqliteOptions)
    })) as T;
  }
};

async function createSqliteWasmAdapter(options?: Record<string, unknown>) {
  const rawOptions = (options ?? {}) as { entities?: EntityType[]; persistent?: boolean; remoteAdapter?: string };
  const entities = (rawOptions.entities ?? []).slice();
  const persistent = rawOptions.persistent === true;
  const dbName = `sw-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: 'sqlite-wasm' },
      // 捕获侧一致性调用点要传 remote：清单里的 QueryCache 实体要求**库级** sync 两侧齐全，
      // 缺一侧 `EntityManager.init()` 直接抛。不传就整个不出现这个键，既有调用方零变化。
      ...(rawOptions.remoteAdapter === undefined ? {} : { remote: { adapter: rawOptions.remoteAdapter } }),
      type: SyncType.None
    }
  });

  let countingAdapter: QueryCountingSqliteWasmAdapter | undefined;
  rxdb.adapter('sqlite-wasm', async db => {
    countingAdapter = new QueryCountingSqliteWasmAdapter(db, {
      vfs: persistent ? 'idb' : 'memory',
      batchTimeout: 1,
      wasmUrl: persistent ? sqliteWasmAsyncUrl : sqliteWasmUrl
    });
    return countingAdapter;
  });

  await rxdb.getAdapter('sqlite-wasm');
  await rxdb.connect('sqlite-wasm');
  if (!countingAdapter) throw new Error('sqlite-wasm adapter factory did not create an adapter');
  return countingAdapter;
}

export const sqliteWasmEncryptedFactory: EncryptedAdapterFactory = {
  name: 'sqlite-wasm',
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createSqliteWasmAdapter(options);
    encryptedQueryCounts.set(adapter, () => adapter.queryCount);
    return adapter;
  }
};
