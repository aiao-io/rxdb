import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { checkOPFSAvailable } from '@aiao/utils';

import { USER_NAME } from '../disk/disk-path';
import { DESKTOP_ENTITIES } from './entities';

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

/**
 * 桌面的本地库：系统设置、磁盘目录树与各内置应用的数据都在这里；文件体由 storage 插件放在 OPFS。
 * 返回已 `init()`、尚未连接的实例，由 {@link DesktopData} 连接并写入初始数据。
 */
export function createDesktopDatabase(baseHref: string): RxDB {
  const rxdb = new RxDB({
    dbName: DB_NAME,
    context: { userId: USER_NAME },
    entities: [...DESKTOP_ENTITIES],
    sync: { local: { adapter: DESKTOP_ADAPTER }, type: SyncType.None }
  });
  rxdb
    .use(rxDBPluginTree)
    .use(rxDBPluginStorage, { rootDir: FILES_ROOT })
    .adapter(DESKTOP_ADAPTER, async db => new RxDBAdapterSqlite(db, await localOptions(baseHref)));
  rxdb.init();
  return rxdb;
}
