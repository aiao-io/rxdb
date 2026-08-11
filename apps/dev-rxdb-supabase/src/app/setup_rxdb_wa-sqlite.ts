import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { getOrCreateUserId, readSupabaseConfig, resolveDatabaseName } from './runtime-config';
import { buildWaSqliteOptions, isSharedWorkerSupported } from './wa-sqlite-options';

// P2-8：原先是 `RxDB | null | undefined` —— 全文件唯一的赋值是下面的 `new RxDB(...)`，
// `null` 从来没有被赋过。多余的联合成员会逼所有读取点去处理一个不可能出现的状态。
let rxdb: RxDB | undefined;

export default () => {
  if (rxdb) return rxdb;
  const dbName = resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME);
  rxdb = new RxDB({
    dbName,
    context: {
      userId: getOrCreateUserId(import.meta.env.VITE_RXDB_USER_ID, localStorage, () => crypto.randomUUID())
    },
    entities: [Todo],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      remote: {
        adapter: 'supabase'
      },
      type: SyncType.Full
    }
  });
  rxdb
    .use(rxDBPluginGraph)
    .adapter('supabase', async db => {
      const config = readSupabaseConfig(import.meta.env);
      const { RxDBAdapterSupabase } = await import('@aiao/rxdb-adapter-supabase');
      return new RxDBAdapterSupabase(db, {
        supabaseUrl: config.url,
        supabaseKey: config.key
      });
    })
    .adapter('wa-sqlite', async db => {
      // P1-1：能力判定与选项构造抽到 wa-sqlite-options.ts，那里能被单测覆盖；
      // 这里只负责把真实的 Worker 工厂喂进去。
      const options = buildWaSqliteOptions(
        { opfs: await checkOPFSAvailable(), sharedWorker: isSharedWorkerSupported() },
        {
          createWorker: () =>
            new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
              type: 'module',
              name: `rxdb-wa-sqlite-worker-${dbName}`
            }),
          createSharedWorker: () =>
            new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
              type: 'module',
              name: `rxdb-wa-sqlite-shared-worker-${dbName}`
            })
        }
      );
      return new RxDBAdapterWaSqlite(db, options);
    });

  if (import.meta.env.DEV) {
    // 先在同步作用域里定住实例：模块级 `rxdb` 是 `RxDB | undefined`，
    // 到了下面的 async 回调里收窄会失效。
    const instance = rxdb;
    void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
      const devtools = getDevToolsConnector();
      devtools.init(instance, getEntityMetadata);
    });
  }
  return rxdb;
};
