import { RxDB, SyncType, type EntityType, type Plugin } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import type { WaSqliteOptions } from '../sqlite.interface.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

class QueryCountingWaSqliteAdapter extends RxDBAdapterWaSqlite {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterWaSqlite['query']>): ReturnType<RxDBAdapterWaSqlite['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

export const waSqliteFactory: AdapterFactory = {
  name: 'wa-sqlite',

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createWaSqliteAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await createSqliteClient(dbName, {
      vfs: 'MemoryAsyncVFS',
      async: true,
      worker: false,
      wasmPath: asyncWasmPath,
      ...(options as WaSqliteOptions)
    })) as T;
  }
};

/**
 * 建一个已连上的 wa-sqlite adapter，**返回真实类型**。
 *
 * 刻意不写成泛型：加密契约套件的 {@link EncryptedAdapterFactory} 要求返回
 * `EncryptedTestAdapter`，由这里的返回类型去做结构匹配 —— adapter 少实现一项能力
 * 会在**类型检查**时炸，而不是等某条用例跑到那一行（RXT-024）。
 */
async function createWaSqliteAdapter(options?: Record<string, unknown>) {
  const rawOptions = (options ?? {}) as {
    entities?: EntityType[];
    persistent?: boolean;
    plugins?: readonly Plugin[];
    remoteAdapter?: string;
  };
  const entities = (rawOptions.entities ?? []).slice();
  const persistent = rawOptions.persistent === true;
  const plugins = rawOptions.plugins ?? [];
  const dbName = `wa-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: 'wa-sqlite' },
      // 捕获侧一致性调用点要传 remote：清单里的 QueryCache 实体要求**库级** sync 两侧齐全，
      // 缺一侧 `EntityManager.init()` 直接抛。不传就整个不出现这个键，既有调用方零变化。
      ...(rawOptions.remoteAdapter === undefined ? {} : { remote: { adapter: rawOptions.remoteAdapter } }),
      type: SyncType.None
    }
  });

  let countingAdapter: QueryCountingWaSqliteAdapter | undefined;
  rxdb.adapter('wa-sqlite', async db => {
    countingAdapter = new QueryCountingWaSqliteAdapter(db, {
      vfs: persistent ? 'IDBBatchAtomicVFS' : 'MemoryAsyncVFS',
      async: true,
      worker: false,
      wasmPath: asyncWasmPath,
      batchTimeout: 1
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
  await rxdb.getAdapter('wa-sqlite');
  await rxdb.connect('wa-sqlite');
  if (!countingAdapter) throw new Error('wa-sqlite adapter factory did not create an adapter');
  return countingAdapter;
}

/**
 * 加密契约套件专用的 factory。与 {@link waSqliteFactory} 分开声明，
 * 因为后者的 `createAdapter<T>` 泛型会把返回类型让给调用方，等于绕开能力检查。
 */
function createEncryptedFactory(name: string, persistent: boolean): EncryptedAdapterFactory {
  return {
    name,
    getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
    createAdapter: async options => {
      const adapter = await createWaSqliteAdapter({ ...options, persistent });
      encryptedQueryCounts.set(adapter, () => adapter.queryCount);
      return adapter;
    }
  };
}

export const waSqliteEncryptedFactory = createEncryptedFactory('wa-sqlite', false);

/** 物理文件安全门禁专用：强制使用 IDBBatchAtomicVFS，禁止逻辑结果伪装落盘字节。 */
export const waSqlitePersistentEncryptedFactory = createEncryptedFactory('wa-sqlite-idb', true);
