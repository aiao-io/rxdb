import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { GRAPH_REPOSITORY_NAME, withSqliteRepository } from './sqlite-repositories';

let rxdb: RxDB | null | undefined;

export function withSqliteGraphRepositories(options: WaSqliteOptions): WaSqliteOptions {
  return withSqliteRepository(options, GRAPH_REPOSITORY_NAME, SqliteGraphRepository);
}

export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('RxDB setup requires a browser platform');

  // 使用 PlatformLocation.getBaseHrefFromDOM() 获取 base href
  // 这是 Angular 官方推荐的方式，直接从 DOM 读取 <base href>
  const baseHref = inject(APP_BASE_HREF);

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test_10',
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
          wasmPath: `${baseHref}wa-sqlite/wa-sqlite.wasm`
        };
      } else {
        options = {
          vfs: 'IDBBatchAtomicVFS',
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-wa-sqlite-shared-worker'
          }),
          workerOwnership: 'client',
          wasmPath: `${baseHref}wa-sqlite/wa-sqlite-async.wasm`
        };
      }
      return new RxDBAdapterWaSqlite(db, withSqliteGraphRepositories(options));
    });

  // rxdb.adapter('pglite', async db => {
  //   const wasmResponse = await fetch('./pglite/pglite.wasm', { cache: 'no-store' });
  //   const wasmArrayBuffer = await wasmResponse.arrayBuffer();
  //   const fsResponse = await fetch('./pglite/pglite.data', { cache: 'no-store' });
  //   const fsBlob = await fsResponse.blob();
  //   return new RxDBAdapterPGlite(db, {
  //     wasmModule: wasmArrayBuffer,
  //     fsBundle: fsBlob
  //   });
  // });

  rxdb.init();

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
