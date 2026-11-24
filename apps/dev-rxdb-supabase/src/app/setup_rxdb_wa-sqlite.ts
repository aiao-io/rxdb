import {
  getEntityMetadata,
  getRxDBIdentityDatabaseName,
  RxDB,
  SyncType,
  type EntitySyncOverride,
  type RxDBIdentity
} from '@aiao/rxdb';
import type { SupabaseAdapterOptions } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem, PublicCatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogSyncRule, FollowedCategories } from './catalog/catalog-sync-rule';
import { getOrCreateUserId, readSupabaseConfig, resolveDatabaseName } from './runtime-config';
import { DEMO_RLS_CHECK } from './supabase-rls-check';
import { readSessionIdentity, type DemoSessionIdentity } from './supabase-session';
import { buildWaSqliteOptions, isSharedWorkerSupported } from './wa-sqlite-options';

// P2-8：原先是 `RxDB | null | undefined` —— 全文件唯一的赋值是下面的 `new RxDB(...)`，
// `null` 从来没有被赋过。多余的联合成员会逼所有读取点去处理一个不可能出现的状态。
let rxdb: RxDB | undefined;

/** 远端模式下，创建 RxDB 之前就要定下来的会话信息。 */
export interface PreparedSession {
  readonly client: SupabaseClient;
  /** 库声明的身份：后端标识 + 会话主体（访客是 anon） */
  readonly identity: RxDBIdentity;
  /** 会话属于哪一类身份 */
  readonly session: DemoSessionIdentity;
  /** 按身份算出的本地库名 */
  readonly databaseName: string;
  /** 这个身份关注的分类：商品同步规则的输入 */
  readonly followed: FollowedCategories;
}

let prepared: PreparedSession | undefined;

/** 远端模式下已经建好的会话；本地模式（没有 Supabase 配置）为 `undefined`。 */
export function getPreparedSession(): PreparedSession | undefined {
  return prepared;
}

/**
 * 在创建 RxDB 之前调用：建 Supabase 客户端，读出会话属于谁，算出这个身份的本地库名。
 *
 * @throws 缺少 Supabase 配置，或读不到会话时
 *
 * @remarks
 * 不替用户登录（epic-015：公开数据给 anon，不靠匿名账号）：没有会话就是访客，以 anon 身份同步公开数据。
 * 本地库按会话身份命名并绑定这个身份（US-035）：访客、匿名用户、每个账号各用各的库，换了身份就是另一个库。
 * 切换身份由页面登录或退出之后重新加载完成。访客的身份在本机就能确定，第一次打开不需要联网。
 */
export async function prepareSupabaseSession(): Promise<void> {
  if (prepared) return;
  const config = readSupabaseConfig(import.meta.env);
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.url, config.key);
  const session = await readSessionIdentity(client.auth);
  const identity: RxDBIdentity = { scope: config.scope, subject: session.subject };
  const databaseName = getRxDBIdentityDatabaseName(resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME), identity);
  prepared = { client, identity, session, databaseName, followed: new FollowedCategories(localStorage, databaseName) };
}

/**
 * 按身份给出的同步覆盖。
 *
 * @remarks
 * - 商品：按授权分区同步（US-033），规则在每轮拉取时读当前关注的分类。
 * - 公开商品：在线浏览规则之外的公开数据（US-036），QueryCache 每次查询都向远端校验。
 * - 访客的 Todo 只存本地：Todo 走未分区的日志同步，只对登录身份开放（US-225）。
 */
function syncOverridesFor(session: PreparedSession | undefined): EntitySyncOverride[] {
  const followed = session?.followed;
  const overrides: EntitySyncOverride[] = [
    {
      entity: CatalogItem,
      sync: {
        type: SyncType.Filter,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase', filter: () => catalogSyncRule(followed?.value() ?? []) }
      }
    },
    {
      entity: PublicCatalogItem,
      sync: {
        type: SyncType.QueryCache,
        local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
        remote: { adapter: 'supabase' }
      }
    }
  ];
  if (session?.session.kind === 'visitor') {
    overrides.push({ entity: Todo, sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } } });
  }
  return overrides;
}

export default () => {
  if (rxdb) return rxdb;
  const dbName = prepared?.databaseName ?? resolveDatabaseName(import.meta.env.VITE_RXDB_DB_NAME);
  rxdb = new RxDB({
    dbName,
    ...(prepared ? { identity: prepared.identity } : {}),
    context: {
      userId: getOrCreateUserId(import.meta.env.VITE_RXDB_USER_ID, localStorage, () => crypto.randomUUID())
    },
    entities: [Todo, CatalogItem, PublicCatalogItem],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      remote: {
        adapter: 'supabase'
      },
      type: SyncType.Full
    },
    syncOverrides: syncOverridesFor(prepared)
  });
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginHistory)
    // 推/拉同步（`syncManager.push()` / `pull()`）自 US-025 阶段 D 起单独成包；
    // 它 `inject: ['plugin:history']`，所以两个都得装。
    .use(rxDBPluginSync)
    // 公开商品的在线浏览走 QueryCache（US-036）
    .use(rxDBPluginQueryCache)
    .adapter('supabase', async db => {
      if (!prepared) await prepareSupabaseSession();
      if (!prepared) throw new Error('Supabase session is required before the remote adapter can connect.');
      const { RxDBAdapterSupabase } = await import('@aiao/rxdb-adapter-supabase');
      // 访客的客户端没有会话，适配器以 anon 身份读公开区；登录之后是 authenticated。
      // 应用与适配器各自解析到 supabase-js 的 ESM / CJS 两份类型声明，结构相同却被当作无关类型（与 dev-rxdb-p2p 同样处理）
      return new RxDBAdapterSupabase(db, {
        client: prepared.client as unknown as SupabaseAdapterOptions['client'],
        rlsCheck: DEMO_RLS_CHECK
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
