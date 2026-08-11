import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import {
  getE2eDbName,
  installSearchDemoTestApi,
  SEARCH_PARITY_ARTICLES,
  SEARCH_PARITY_COMMENTS
} from '@aiao/rxdb-test';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { Article, Comment, ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { GRAPH_REPOSITORY_NAME, withSqliteWasmRepository } from './sqlite-wasm-repositories';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'aiao';
const SEARCH_PLUGIN_CONFIG = { debounce: 300, pageSize: 20, snippetLength: 64 } as const;

export function withSqliteWasmGraphRepositories(options: SqliteOptions): SqliteOptions {
  return withSqliteWasmRepository(options, GRAPH_REPOSITORY_NAME, SqliteGraphRepository);
}

function getSqliteWasmUrl(baseHref: string, vfs: 'opfs' | 'idb'): string {
  return vfs === 'opfs' ? `${baseHref}sqlite-wasm/wa-sqlite.wasm` : `${baseHref}sqlite-wasm/wa-sqlite-async.wasm`;
}

// Angular demo 历史上用 localStorage（跨标签页共享同一隔离名）+ e2e 端口 8200 检测，
// 这两个差异通过 options 注入，避免破坏既有 spec 期望
function getAngularDbName(): string {
  return getE2eDbName(DEFAULT_DB_NAME, {
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    isE2e: () =>
      typeof window !== 'undefined' && (window.location.port === '8200' || Boolean(window.navigator.webdriver))
  });
}

async function seedSearchParityData(db: RxDB) {
  const articleRepo = db.entityManager.getRepository(Article);
  const commentRepo = db.entityManager.getRepository(Comment);
  for (const articleData of SEARCH_PARITY_ARTICLES) {
    await articleRepo.create(Object.assign(new Article(), articleData));
  }
  for (const commentData of SEARCH_PARITY_COMMENTS) {
    await commentRepo.create(Object.assign(new Comment(), commentData));
  }
}

export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('RxDB setup requires a browser platform');
  const baseHref = inject(APP_BASE_HREF);
  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: getAngularDbName(),
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
      const forceIdbForE2E = typeof window !== 'undefined' && window.location.port === '8200';
      const opfsAvailable = !forceIdbForE2E && (await checkOPFSAvailable());
      if (opfsAvailable) {
        options = {
          vfs: 'opfs',
          wasmUrl: getSqliteWasmUrl(baseHref, 'opfs'),
          worker: true,
          workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqlite-wasm-worker'
          })
        };
      } else {
        options = {
          vfs: 'idb',
          wasmUrl: getSqliteWasmUrl(baseHref, 'idb'),
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./sqlite-wasm-shared.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqlite-wasm-shared-worker'
          })
        };
      }
      return new RxDBAdapterSqlite(db, withSqliteWasmGraphRepositories(options));
    });

  rxdb.use(rxDBPluginSearch, SEARCH_PLUGIN_CONFIG);

  rxdb.init();
  installSearchDemoTestApi(rxdb, { Article, Comment, seedData: seedSearchParityData });

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
