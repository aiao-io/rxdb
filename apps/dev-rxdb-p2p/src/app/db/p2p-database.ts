/**
 * 每个登录用户一个本地库：wa-sqlite 存本地，Supabase 做远端，清单实体由 P2P 插件登记。
 *
 * @remarks
 * 实体类是模块单例，只能绑定一个 RxDB 实例；换用户时整页重载，不在同一页里建第二个库。
 */
import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import type { SupabaseAdapterOptions } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginP2PFiles } from '@aiao/rxdb-plugin-p2p';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { checkOPFSAvailable } from '@aiao/utils';
import type { SupabaseClient } from '@supabase/supabase-js';
import { P2PFallbackEnvelopeEntity } from './fallback-envelope.entity';
import { buildWaSqliteOptions, isSharedWorkerSupported } from './wa-sqlite-options';

/** 本地适配器名。 */
export const LOCAL_ADAPTER = 'wa-sqlite';
/** 远端适配器名。 */
export const REMOTE_ADAPTER = 'supabase';

/**
 * 创建（尚未连接的）本地库。
 *
 * @param userId - Supabase `auth.uid()`：库名按用户隔离，`createdBy` / `updatedBy` 也写它
 * @param client - 已登录的 Supabase 客户端，远端读写按该用户身份过 RLS
 */
export const createP2PDatabase = (userId: string, client: SupabaseClient): RxDB => {
  // wa-sqlite 的 VFS 路径上限是 49 字节（含 RxDB 追加的 `@<后缀>`），用去掉连字符的 userId：p2p- + 32 位 hex。
  const dbName = `p2p-${userId.replaceAll('-', '')}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId },
    entities: [P2PFallbackEnvelopeEntity],
    sync: { local: { adapter: LOCAL_ADAPTER }, remote: { adapter: REMOTE_ADAPTER }, type: SyncType.Full }
  });
  rxdb
    .use(rxDBPluginHistory)
    .use(rxDBPluginSync)
    .use(rxDBPluginP2PFiles)
    .adapter(REMOTE_ADAPTER, async db => {
      const { RxDBAdapterSupabase } = await import('@aiao/rxdb-adapter-supabase');
      // 同一个 supabase-js 类：tsc 给本应用解析到 index.d.mts、给适配器的声明解析到 index.d.cts，
      // 带 protected 成员的类按名义比较，两份声明互不兼容；打包后两边是同一个模块。
      return new RxDBAdapterSupabase(db, { client: client as unknown as SupabaseAdapterOptions['client'] });
    })
    .adapter(LOCAL_ADAPTER, async db => {
      const capabilities = { opfs: await checkOPFSAvailable(), sharedWorker: isSharedWorkerSupported() };
      const options = buildWaSqliteOptions(capabilities, {
        createWorker: () =>
          new Worker(new URL('./wa-sqlite.worker', import.meta.url), { type: 'module', name: `wa-sqlite-${dbName}` }),
        createSharedWorker: () =>
          new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
            type: 'module',
            name: `wa-sqlite-shared-${dbName}`
          })
      });
      return new RxDBAdapterWaSqlite(db, options);
    });

  if (import.meta.env.DEV) {
    // 连接器只读构造期状态（entityManager / config.entities 活数组），不依赖 connect() 完成；
    // 生产构建的 define 把守卫折叠成 false，整个动态导入随之被摇树（见 vite-env.d.ts）。
    void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
      getDevToolsConnector().init(rxdb, getEntityMetadata);
    });
  }

  return rxdb;
};
