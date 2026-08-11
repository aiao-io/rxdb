import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { getE2eDbName, installSearchDemoTestApi } from '@aiao/rxdb-test';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { Article, Comment, ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { checkOPFSAvailable } from '@aiao/utils';
import { seedSearchParityData } from './search-parity-seed.js';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'aiao';
const SEARCH_PLUGIN_CONFIG = { debounce: 300, pageSize: 20, snippetLength: 64 } as const;

export default () => {
  if (rxdb) return rxdb;
  const dbName = getE2eDbName(DEFAULT_DB_NAME);
  rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [...ENTITIES, ...shop_entities, EncryptedUser],
    sync: {
      local: {
        adapter: 'sqlite-wasm'
      },
      type: SyncType.None
    }
  });
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage)
    .use(rxDBPluginWorkspace)
    .adapter('sqlite-wasm', async db => {
      let options: SqliteOptions;
      const available = await checkOPFSAvailable();
      if (available) {
        options = {
          vfs: 'opfs',
          worker: true,
          workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqlite-wasm-worker'
          })
        };
      } else {
        options = {
          vfs: 'idb',
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./sqlite-wasm-shared.worker', import.meta.url), {
            type: 'module',
            name: `rxdb-sqlite-wasm-shared-worker-${dbName}`
          })
        };
      }
      return new RxDBAdapterSqlite(db, options);
    });

  rxdb.use(rxDBPluginSearch, SEARCH_PLUGIN_CONFIG);

  rxdb.init();
  installSearchDemoTestApi(rxdb, { Article, Comment, seedData: seedSearchParityData });

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
