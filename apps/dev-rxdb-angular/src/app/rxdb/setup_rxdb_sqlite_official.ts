import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, type SqliteOptions } from '@aiao/rxdb-adapter-sqlite';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

let rxdb: RxDB | null | undefined;

export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('RxDB setup requires a browser platform');

  const baseHref = inject(APP_BASE_HREF);

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test_sqlite_10',
    context: { userId: 'userId' },
    entities: [...ENTITIES, ...shop_entities],
    sync: {
      local: {
        adapter: 'sqlite'
      },
      type: SyncType.None
    }
  });
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage)
    .use(rxDBPluginWorkspace)
    .adapter('sqlite', async db => {
      let options: SqliteOptions = {
        wasmPath: `${baseHref}official-sqlite-wasm/sqlite3.wasm`,
        opfsProxyPath: `${baseHref}official-sqlite-wasm/sqlite3-opfs-async-proxy.js`
      };

      if (await checkOPFSAvailable()) {
        options = {
          ...options,
          opfs: true,
          worker: true,
          workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqlite-worker'
          })
        };
      }

      return new RxDBAdapterSqlite(db, options);
    });

  rxdb.init();

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
