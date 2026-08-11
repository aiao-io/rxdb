import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { getE2eDbName } from '@aiao/rxdb-test';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { checkOPFSAvailable } from '@aiao/utils';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';
import waSqlite from 'wa-sqlite/dist/wa-sqlite.wasm?url';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'test_6';

export default () => {
  if (rxdb) return rxdb;
  const dbName = getE2eDbName(DEFAULT_DB_NAME);
  rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [...ENTITIES, ...shop_entities, EncryptedUser],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      type: SyncType.None
    }
  });
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage)
    .use(rxDBPluginWorkspace)
    .adapter('wa-sqlite', async db => {
      let options: WaSqliteOptions;
      const available = await checkOPFSAvailable();
      if (available) {
        options = {
          vfs: 'OPFSCoopSyncVFS',
          // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测；wasmPath 指向的是
          // 同步产物 wa-sqlite.wasm，必须显式声明 sync 模式，否则会加载 asyncify glue 配同步 wasm。
          async: false,
          worker: true,
          workerInstance: new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-wa-sqlite-worker'
          }),
          workerOwnership: 'client',
          wasmPath: waSqlite
        };
      } else {
        options = {
          vfs: 'IDBBatchAtomicVFS',
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
            type: 'module',
            name: `rxdb-wa-sqlite-shared-worker-${dbName}`
          }),
          workerOwnership: 'client',
          wasmPath: waSqliteAsync
        };
      }
      return new RxDBAdapterWaSqlite(db, options);
    });

  rxdb.init();

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
