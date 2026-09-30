import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
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

/** e2e 需要「未启用 + 有内容」的手动启用路径时，用这个 localStorage 键跳过启动时的自动启用。 */
const WORKING_TREE_AUTO_ENABLE_SKIP_KEY = 'rxdb-e2e-skip-working-tree-auto-enable';

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
    .use(rxDBPluginHistory)
    .use(rxDBPluginStorage)
    .use(rxDBPluginTree)
    .use(rxDBPluginWorkspace)
    // 只装不手动启用：`workingTree.enable()` 是数据库级的一次性开关（v1 无 `disable()`），
    // 按在这里等于替所有 demo 页做了这个决定。空库由启动时的 `enableIfEmpty()` 自动启用
    // （见 `rxdb.init()` 之后那一行）；有内容的库保持未启用，启用走 /working-tree 面板的显式点击。
    .use(rxDBPluginWorkingTree)
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
  // 空库在应用启动时自动初始化工作树；已有内容的库保持未启用，由 /working-tree 面板显式点击。
  // `enableIfEmpty()` 自会解析 localAdapter$（连接就绪后生效），这里 fire-and-forget 即可。
  if (typeof window !== 'undefined' && window.localStorage.getItem(WORKING_TREE_AUTO_ENABLE_SKIP_KEY) === null) {
    void rxdb.workingTree.enableIfEmpty().catch(() => undefined);
  }
  installSearchDemoTestApi(rxdb, { Article, Comment, seedData: seedSearchParityData });

  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
