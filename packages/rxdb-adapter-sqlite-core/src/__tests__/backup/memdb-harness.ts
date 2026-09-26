/**
 * sqlite-core 自己跑备份共享套件用的后端：官方 sqlite-wasm 的 oo1 API，持久化目标落在 `memdb` VFS。
 *
 * @remarks
 * `memdb` 上的库在同一个 WASM 实例里按路径共享，只要还有一条连接开着就一直在——这正是「关掉 adapter、
 * 再用新实例打开同一个库名」需要的持久化语义，而且主线程就能用，不必像 OPFS 那样绕进 Worker。
 * 每个路径留一条永不关闭的连接兜住数据。代价是页面一关全都没了，所以强杀恢复用例在这里整组跳过，
 * 由四个真实 adapter 的持久化存储负责。
 */
import type { RxDB } from '@aiao/rxdb';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { Oo1ClientBase, type Oo1ClientLoadOptions } from '../../Oo1ClientBase.js';
import { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteBackupStorage } from '../../backup/sqlite-backup.interface.js';
import { assertOo1Static, type Oo1Database, type Oo1Static } from '../../oo1-types.js';
import type { SqliteClientLike } from '../../sqlite-core.types.js';
import type { SqliteBackupEngineObjects, SqliteBackupHarness, SqliteBackupStorageKind } from '../../testing.js';

/**
 * 模拟 sqliteai 那样的内置扩展：每条新连接（包括临时的 `:memory:`）一打开就自动建出一张带初始行的表
 * 和一张 FTS5 虚表，与它的影子表一起构成「空库」本来的样子。
 */
const ENGINE_SQL = `
  CREATE TABLE IF NOT EXISTS engine_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO engine_settings (key, value) VALUES ('mode', 'default');
  CREATE VIRTUAL TABLE IF NOT EXISTS engine_fts USING fts5(body);
`;

const ENGINE_OBJECTS: SqliteBackupEngineObjects = {
  names: [
    'engine_settings',
    'engine_fts',
    ...['config', 'content', 'data', 'docsize', 'idx'].map(s => `engine_fts_${s}`)
  ].map(name => `table:${name}`),
  write: "INSERT INTO engine_settings (key, value) VALUES ('user', 'kept')",
  read: 'SELECT key, value FROM engine_settings ORDER BY key'
};

const loadMemdbModule = async (engine: boolean): Promise<Oo1Static> => {
  const initFn = sqlite3InitModule as (options: Record<string, unknown>) => Promise<unknown>;
  const module = await initFn({ print: () => undefined, printErr: () => undefined });
  assertOo1Static(module);
  const { DB } = module.oo1;
  /** 每个 memdb 路径一条兜底连接：最后一条连接关闭时 memdb 会丢掉整个库。 */
  const keepers = new Map<string, Oo1Database>();
  const uriOf = (path: string) => `file:${path}?vfs=memdb`;
  class EngineDb extends DB {
    constructor(filename?: string, flags?: string, vfs?: string) {
      super(filename, flags, vfs);
      if (engine) this.exec({ sql: ENGINE_SQL });
    }
  }
  // 基类在 `opfs: true` 时 `new OpfsDb(path)`；这里把它换成 memdb 上的同名库。
  class MemdbDb extends EngineDb {
    constructor(path = '/memdb.sqlite3') {
      if (!keepers.has(path)) keepers.set(path, new EngineDb(uriOf(path), 'c'));
      super(uriOf(path), 'c');
    }
  }
  return { ...module, oo1: { ...module.oo1, DB: EngineDb, OpfsDb: MemdbDb } };
};

const modules = new Map<boolean, Promise<Oo1Static>>();

/** 官方 sqlite-wasm 的 oo1 客户端，持久化路径改走 memdb。 */
class MemdbClient extends Oo1ClientBase<MemdbAdapterOptions> {
  protected get clientName(): string {
    return 'memdb';
  }

  protected loadModule(options?: MemdbAdapterOptions): Promise<Oo1Static> {
    const engine = options?.engine === true;
    const loaded = modules.get(engine) ?? loadMemdbModule(engine);
    modules.set(engine, loaded);
    return loaded;
  }
}

interface MemdbAdapterOptions extends Oo1ClientLoadOptions {
  readonly opfs: boolean;
  /** 模拟每条连接都自动建对象的引擎，见 {@link ENGINE_SQL}。 */
  readonly engine?: boolean;
  /** 模拟缺少这个方法的客户端（例如桌面端）。 */
  readonly missing?: MemdbRestoreCapability;
}

/** 恢复要求客户端具备的可选方法。 */
export type MemdbRestoreCapability = 'setChangeEventsMuted' | 'describeBlankDatabase';

/** 与官方 sqlite adapter 同构的最小 adapter：`opfs` 决定内存库还是 memdb 持久化库。 */
class MemdbAdapter extends RxDBAdapterSqliteBase {
  readonly #dbName: string;
  override readonly name: string = 'memdb';

  constructor(
    rxdb: RxDB,
    readonly options: MemdbAdapterOptions
  ) {
    super(rxdb);
    this.#dbName = rxdb.config.dbName;
  }

  protected override backupStorage(): SqliteBackupStorage {
    if (!this.options.opfs) return { kind: 'memory', label: 'memory' };
    if (this.options.opfsFallback === 'memory') return { kind: 'unsupported', field: 'opfsFallback', actual: 'memory' };
    return this.persistentBackupStorage('memdb');
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    const client = new MemdbClient();
    await client.init(this.#dbName, { ...this.options, batchTimeout: 1 });
    if (this.options.missing) Object.defineProperty(client, this.options.missing, { value: undefined });
    return client;
  }
}

const createMemdbHarness = (engine: boolean): SqliteBackupHarness => ({
  adapterName: 'memdb',
  persistentLabel: 'memdb',
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  createAdapter: (rxdb: RxDB, kind: SqliteBackupStorageKind) =>
    new MemdbAdapter(rxdb, { opfs: kind === 'persistent', engine }) as unknown as RxDBAdapterSqliteBase,
  createUnsupportedAdapter: (rxdb: RxDB) =>
    new MemdbAdapter(rxdb, { opfs: true, opfsFallback: 'memory', engine }) as unknown as RxDBAdapterSqliteBase,
  unsupportedField: 'opfsFallback',
  fts5: true,
  persistentJournalMode: 'memory',
  engineObjects: engine ? ENGINE_OBJECTS : null,
  interruptWorker: { unsupported: 'memdb 只活在页面的 WASM 实例里，Worker 被强杀后存储随之消失' }
});

/** sqlite-core 的备份后端契约。 */
export const memdbBackupHarness: SqliteBackupHarness = createMemdbHarness(false);

/** 同一个后端，但引擎在每条新连接上自动建表（模拟 sqliteai 的内置扩展）。 */
export const memdbEngineBackupHarness: SqliteBackupHarness = createMemdbHarness(true);

/**
 * 同一个后端，但客户端缺少恢复需要的一个方法。
 *
 * @param missing - 缺少的方法
 * @returns harness
 */
export const memdbHarnessWithout = (missing: MemdbRestoreCapability): SqliteBackupHarness => ({
  ...memdbBackupHarness,
  createAdapter: (rxdb: RxDB, kind: SqliteBackupStorageKind) =>
    new MemdbAdapter(rxdb, { opfs: kind === 'persistent', missing }) as unknown as RxDBAdapterSqliteBase
});
