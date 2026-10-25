import { RxDB, SyncType, type EntityType, type Plugin } from '@aiao/rxdb';
import type { TransactionFun } from '@aiao/rxdb-adapter-sqlite-core';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { queryCountOf, registerQueryCount, type EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterSqliteai } from '../RxDBAdapterSqliteai.js';
import type { SqliteaiOptions } from '../sqliteai.interface.js';

class QueryCountingSqliteaiAdapter extends RxDBAdapterSqliteai {
  queryCount = 0;

  override transaction<T extends TransactionFun>(fun: T, transactionLog = true): Promise<Awaited<ReturnType<T>>> {
    return super.transaction<TransactionFun>(async executor => {
      const execute = executor.execute.bind(executor);
      executor.execute = (...args) => {
        this.queryCount++;
        return execute(...args);
      };
      return fun(executor);
    }, transactionLog) as Promise<Awaited<ReturnType<T>>>;
  }
}

const silentPrintErr = (): void => undefined;
const workers = new WeakMap<RxDB, Worker>();

const terminateWorker = (rxdb: RxDB): void => {
  const worker = workers.get(rxdb);
  if (!worker) return;
  workers.delete(rxdb);
  worker.terminate();
};

/** 非持久档的连法：主线程内存库，引擎的 stderr 静音。 */
const memoryAdapterOptions = (): SqliteaiOptions => ({ printErr: silentPrintErr });

/** 快照库用的 Worker：断开不会替调用方终止它们，测试文件在用例之间统一收掉。 */
const worktreeWorkers = new Set<Worker>();

/**
 * 给只读检出位的快照实例造适配器（US-313）：与本工厂非持久档同一份连法，每个实例一个独立的内存库。
 *
 * @param db - 快照实例
 * @returns 快照库的适配器
 *
 * @remarks
 * 内存档：快照的读写与封印跟存储档位无关。持久档要一个快照库一个专用 Worker（OPFS 只在 Worker 里开），
 * 整套检出位用例都那么建的话，浏览器内存涨到约四倍，见 {@link createSqliteaiPersistentWorktreeAdapter}。
 */
export const createSqliteaiWorktreeAdapter = (db: RxDB): RxDBAdapterSqliteai =>
  new RxDBAdapterSqliteai(db, memoryAdapterOptions());

/**
 * 给只读检出位的快照实例造持久档适配器（US-313）：与本工厂持久档同一份连法（专用 Worker 里的 OPFS），
 * 每个快照实例一个 Worker、一个库文件。
 *
 * @param db - 快照实例
 * @returns 快照库的适配器
 *
 * @remarks
 * 只给「持久归属的检出位放开之后原样再打开」那条用例用（`createDatabaseWithPersistentSnapshots`）。
 * Worker 由 {@link terminateSqliteaiWorktreeWorkers} 收掉。
 */
export const createSqliteaiPersistentWorktreeAdapter = (db: RxDB): RxDBAdapterSqliteai => {
  const worker = new Worker(new URL('./sqliteai-test.worker', import.meta.url), {
    type: 'module',
    name: `${db.config.dbName}-worktree-worker`
  });
  worktreeWorkers.add(worker);
  return new RxDBAdapterSqliteai(db, { opfs: true, opfsFallback: 'throw', worker: true, workerInstance: worker });
};

/** 终止 {@link createSqliteaiPersistentWorktreeAdapter} 建过的全部 Worker；在快照实例都断开之后调用。 */
export const terminateSqliteaiWorktreeWorkers = (): void => {
  for (const worker of worktreeWorkers) worker.terminate();
  worktreeWorkers.clear();
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
        : memoryAdapterOptions()),
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
  getQueryCount: queryCountOf,
  createAdapter: async options => {
    const adapter = await createSqliteaiAdapter(options);
    return registerQueryCount(adapter, () => adapter.queryCount);
  }
};
