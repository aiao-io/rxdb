import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { getE2eDbName } from '@aiao/rxdb-test';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';
import { ENTITIES } from '../entities/asset-entities';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'admin-workbench';

export default (): RxDB => {
  if (rxdb) return rxdb;
  const dbName = getE2eDbName(DEFAULT_DB_NAME);
  rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [...ENTITIES],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      type: SyncType.None
    }
  });
  rxdb.use(rxDBPluginHistory).adapter('wa-sqlite', db => {
    const options: WaSqliteOptions = {
      // 主线程 + IndexedDB：US-217 备份/恢复矩阵里浏览器可备份的组合——
      // OPFS 系 VFS 与 worker/sharedWorker transport 都报 unsupported_combination，
      // 工作台必须选这条路径（US-527）。
      vfs: 'IDBBatchAtomicVFS',
      wasmPath: waSqliteAsync
    };
    return new RxDBAdapterWaSqlite(db, options);
  });
  rxdb.init();
  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);
  return rxdb;
};
