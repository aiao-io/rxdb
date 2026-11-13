import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { checkOPFSAvailable } from '@aiao/utils';

import { USER_NAME } from '../disk/disk-path';
import { DESKTOP_ENTITIES } from './entities';
import { SchemaGuard } from './schema-guard';

/** 本地适配器名：`@aiao/rxdb-adapter-sqlite-wasm`。 */
export const DESKTOP_ADAPTER = 'sqlite-wasm' as const;
/** 库名要短：RxDB 会追加 `@<后缀>`，SQLite 的 VFS 路径有长度上限。 */
const DB_NAME = 'aiao-desktop';
/** storage 插件在 OPFS 里存放文件体的根目录。 */
export const FILES_ROOT = 'aiao-desktop-files';

/** 和 dev-rxdb-angular 相同的选择：OPFS 可用时库文件落在 OPFS（必须在专用 Worker 里），否则用 IndexedDB。 */
async function localOptions(baseHref: string): Promise<SqliteOptions> {
  if (await checkOPFSAvailable())
    return {
      vfs: 'opfs',
      wasmUrl: `${baseHref}sqlite-wasm/wa-sqlite.wasm`,
      worker: true,
      workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), {
        type: 'module',
        name: 'aiao-desktop-sqlite'
      }),
      workerOwnership: 'client'
    };
  return { vfs: 'idb', wasmUrl: `${baseHref}sqlite-wasm/wa-sqlite-async.wasm` };
}

/** 适配器事务的回调类型（取自基类的签名，免得再依赖 sqlite-core 包）。 */
type SqliteTransactionFun = Parameters<RxDBAdapterSqlite['transaction']>[0];

/**
 * 桌面的 sqlite-wasm 适配器：每次写库（事务）之前先过 {@link SchemaGuard}。另一个标签页把库升到比本构建更新的
 * schema 之后，这里拒绝写入（ADESK-US-106）；读不受影响。
 */
class DesktopSqliteAdapter extends RxDBAdapterSqlite {
  constructor(
    rxdb: RxDB,
    options: SqliteOptions,
    private readonly guard: SchemaGuard
  ) {
    super(rxdb, options);
  }

  override async transaction<T extends SqliteTransactionFun>(
    transactionFun: T,
    transactionLog = true
  ): Promise<Awaited<ReturnType<T>>> {
    await this.guard.assertWritable();
    return super.transaction(transactionFun, transactionLog);
  }
}

const GUARDS = new WeakMap<RxDB, SchemaGuard>();

/** 桌面库的写前守卫；只有 {@link createDesktopDatabase} 建出来的库才有。 */
export function schemaGuardOf(rxdb: RxDB): SchemaGuard {
  const guard = GUARDS.get(rxdb);
  if (!guard) throw new Error('这个 RxDB 实例不是 createDesktopDatabase 建的，没有写前守卫');
  return guard;
}

/**
 * 桌面的本地库：系统设置、磁盘目录树与各内置应用的数据都在这里；文件体由 storage 插件放在 OPFS。
 * 返回已 `init()`、尚未连接的实例，由 {@link DesktopData} 连接并写入初始数据。
 */
export function createDesktopDatabase(baseHref: string): RxDB {
  const guard = new SchemaGuard();
  const rxdb = new RxDB({
    dbName: DB_NAME,
    context: { userId: USER_NAME },
    entities: [...DESKTOP_ENTITIES],
    sync: { local: { adapter: DESKTOP_ADAPTER }, type: SyncType.None }
  });
  rxdb
    .use(rxDBPluginTree)
    .use(rxDBPluginStorage, { rootDir: FILES_ROOT })
    .adapter(DESKTOP_ADAPTER, async db => new DesktopSqliteAdapter(db, await localOptions(baseHref), guard));
  GUARDS.set(rxdb, guard);
  rxdb.init();
  if (import.meta.env.DEV) {
    void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
      getDevToolsConnector().init(rxdb, getEntityMetadata);
    });
  }
  return rxdb;
}
