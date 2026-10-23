import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';
import { Bookmark } from '../entities/bookmark';

let rxdb: RxDB | null | undefined;

/** 消费示例用固定库名（e2e 隔离靠 Playwright 每测试新 context 的全新 IndexedDB）。 */
const DB_NAME = 'admin-consumer';

export default (): RxDB => {
  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: DB_NAME,
    context: { userId: 'userId' },
    entities: [Bookmark],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      type: SyncType.None
    }
  });
  rxdb.use(rxDBPluginHistory).adapter('wa-sqlite', db => {
    const options: WaSqliteOptions = {
      vfs: 'IDBBatchAtomicVFS',
      wasmPath: waSqliteAsync
    };
    return new RxDBAdapterWaSqlite(db, options);
  });
  rxdb.init();
  return rxdb;
};
