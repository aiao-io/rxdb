import { getEntityMetadata, getRxDBIdentityDatabaseName, RxDB, SyncType, type RxDBIdentity } from '@aiao/rxdb';
import type { SupabaseAdapterOptions } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateUserId, readSupabaseConfig, resolveDatabaseName } from './runtime-config';
import { ensureSupabaseSession } from './supabase-session';
import { buildWaSqliteOptions, isSharedWorkerSupported } from './wa-sqlite-options';

// P2-8：原先是 `RxDB | null | undefined` —— 全文件唯一的赋值是下面的 `new RxDB(...)`，
// `null` 从来没有被赋过。多余的联合成员会逼所有读取点去处理一个不可能出现的状态。
let rxdb: RxDB | undefined;

interface PreparedSession {
  readonly client: SupabaseClient;
  readonly identity: RxDBIdentity;
}

let prepared: PreparedSession | undefined;

/**
 * 在创建 RxDB 之前调用：建 Supabase 客户端、确保有会话（没有就匿名登录），记下会话属于谁。
 *
 * @throws 缺少 Supabase 配置、匿名登录被拒（部署没有开启匿名登录），或读不到会话时
 *
 * @remarks
 * 本地库按会话身份命名并绑定这个身份（US-035）：换了账号就是另一个库，不会读到上一个账号同步下来的行。
 * 库名在创建 RxDB 时就要定下来，所以会话必须先于它建好。会话保存在浏览器里，刷新后沿用同一个匿名用户，
 * 之后打开不需要网络；**第一次打开需要联网**，匿名登录要请求 Supabase。
 */
export async function prepareSupabaseSession(): Promise<void> {
  if (prepared) return;
  const config = readSupabaseConfig(import.meta.env);
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.key);
  const subject = await ensureSupabaseSession(client.auth);
  prepared = { client, identity: { scope: config.url, subject } };
}

export default () => {
  if (rxdb) return rxdb;
  if (!prepared) {
    throw new Error(
      'prepareSupabaseSession() must finish before RxDB is created: the local database is named after the session identity.'
    );
  }
  const { client, identity } = prepared;
  const dbName = getRxDBIdentityDatabaseName(resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME), identity);
  rxdb = new RxDB({
    dbName,
    identity,
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
    .use(rxDBPluginHistory)
    // 推/拉同步（`syncManager.push()` / `pull()`）自 US-025 阶段 D 起单独成包；
    // 它 `inject: ['plugin:history']`，所以两个都得装。
    .use(rxDBPluginSync)
    .adapter('supabase', async db => {
      const { RxDBAdapterSupabase } = await import('@aiao/rxdb-adapter-supabase');
      // 日志同步只对已登录身份开放（US-225）：会话已经在 prepareSupabaseSession() 里建好，客户端就是那一个。
      // 应用与适配器各自解析到 supabase-js 的 ESM / CJS 两份类型声明，结构相同却被当作无关类型（与 dev-rxdb-p2p 同样处理）
      return new RxDBAdapterSupabase(db, { client: client as unknown as SupabaseAdapterOptions['client'] });
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
