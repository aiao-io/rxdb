import { RxDB, SyncType, type EntityType, type Plugin } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
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
  const rawOptions = (options ?? {}) as {
    entities?: EntityType[];
    persistent?: boolean;
    plugins?: readonly Plugin[];
    remoteAdapter?: string;
  };
  const entities = (rawOptions.entities ?? []).slice();
  const persistent = rawOptions.persistent === true;
  const plugins = rawOptions.plugins ?? [];
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

  // 共享套件（undo/redo、版本分支、系统表迁移）直接读 `adapter.rxdb.versionManager`，
  // 而历史子系统自 US-025 阶段 C 起住在插件里。`AdapterFactory` 的契约把「装好插件」
  // 算成工厂的职责（见 `@aiao/rxdb-adapter-sqlite-core/testing`），所以登记在这里。
  rxdb.use(rxDBPluginHistory);

  // 其余插件**由调用点传进来**，不在这里无条件装：本工厂被二十来个共享套件复用，
  // 无条件装上工作树插件等于给每一个都多建 10 张系统表。默认空数组 ⇒ 既有调用方零变化。
  //
  // 工作树插件也刻意不静态 import：`src/testing.ts` 用 `import.meta.glob` 把本文件挂在已发布的
  // `./testing` 子路径上，静态 import 一个只在 spec 里用的 devDependency
  // （`@aiao/rxdb-plugin-working-tree`）就等于把它塞进那条发布链。收函数则只有 spec 认识它，
  // 而 spec 不进发布物。
  //
  // 两者都必须排在 `connect()` 之前：贡献系统能力的插件晚于 `init()` 注册会被核心当场拒绝
  // （系统表随建表一次建出，那时已经来不及），而 `connect()` 的第一步就是 `init()`。
  for (const plugin of plugins) rxdb.use(plugin);
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
