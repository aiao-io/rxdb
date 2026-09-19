import { RxDB, SyncType, type EntityType, type Plugin } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
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
  const rawOptions = (options ?? {}) as SqliteaiOptions & {
    entities?: EntityType[];
    persistent?: boolean;
    plugins?: readonly Plugin[];
    remoteAdapter?: string;
  };
  // `remoteAdapter` 与 `plugins` 必须在这里解构出去，不能留在 `adapterOptions` 里：那个对象整个
  // 展进 `SqliteaiOptions`，多带一个它不认识的键。
  const { entities: entitiesOption, persistent, plugins = [], remoteAdapter, ...adapterOptions } = rawOptions;
  const entities = (entitiesOption ?? []).slice();
  const dbName = `sqliteai-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: 'sqliteai' },
      // 捕获侧一致性调用点要传 remote：清单里的 QueryCache 实体要求**库级** sync 两侧齐全，
      // 缺一侧 `EntityManager.init()` 直接抛。不传就整个不出现这个键，既有调用方零变化。
      ...(remoteAdapter === undefined ? {} : { remote: { adapter: remoteAdapter } }),
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
