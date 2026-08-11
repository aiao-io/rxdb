import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
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

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'aiao';
const SEARCH_PLUGIN_CONFIG = { debounce: 300, pageSize: 20, snippetLength: 64 } as const;

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
            name: `rxdb-sqlite-wasm-worker-${dbName}`
          })
        };
      } else {
        options = {
          vfs: 'idb',
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./sqlite-wasm-shared.worker', import.meta.url), {
            type: 'module',
            // P2-7：名字必须带上 dbName。SharedWorker 的**去重键就是这个 name**——
            // 固定字符串会让并行 E2E（各自 `getE2eDbName()` 拿到不同库名）共用同一个
            // SharedWorker 实例，测试之间互相看到对方的连接与变更。
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
