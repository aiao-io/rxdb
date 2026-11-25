import {
  MEDIA_CONFIG_SYNC_ENTITIES,
  createMediaConfigSyncOptions,
  templateAttributionMigration
} from '@aiao-media/domain';
import { RxDB, type EntityType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, type SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeAdminUserId } from './admin-rxdb';

// 配置库的适配器与插件只在打开配置页时按需加载，不进入后台首屏包。

/**
 * 适配器声明里的 SupabaseClient：同一版本的 supabase-js 经适配器的产物类型解析时是另一份类型身份，
 * 结构相同却被 TS 视为无关类型，所以按适配器自己的构造参数取类型。
 */
type RxdbSupabaseClient = NonNullable<ConstructorParameters<typeof RxDBAdapterSupabase>[1]['client']>;

/** Admin 配置工作区使用的领域实体；RxDB 内部系统实体不进入 Supabase 业务同步契约。 */
export const ADMIN_CONFIG_ENTITIES: readonly EntityType[] = MEDIA_CONFIG_SYNC_ENTITIES;

/** 需要 RLS 自检的远端配置表。 */
export const ADMIN_CONFIG_RLS_TABLES: ReadonlyArray<{ schema: string; table: string }> = Object.freeze([
  { schema: 'public', table: 'media_prompt_templates' },
  { schema: 'public', table: 'media_provider_policies' },
  { schema: 'public', table: 'media_platform_models' },
  { schema: 'public', table: 'media_config_projection_commits' },
  { schema: 'public', table: 'media_config_projection_changes' }
]);

/** {@link createAdminConfigDatabase} 的输入。 */
export interface AdminConfigDatabaseOptions {
  /** 由 {@link adminConfigDatabaseName} 派生的本地库名 */
  readonly dbName: string;
  /** 当前管理员 */
  readonly userId: string;
  /** 当前管理员的工作区；同步只拉取它 */
  readonly workspaceId: string;
  /** 携带管理员普通 JWT 的同步客户端 */
  readonly supabase: SupabaseClient;
}

/**
 * 创建配置库：本地 SQLite（IndexedDB VFS）+ 普通 JWT 的 Supabase 远端。
 *
 * @remarks
 * 配置实体按工作区双向同步并受工作树版本控制；提交投影以查询缓存读取，写入与状态推进见 `ProductClient`。
 */
export function createAdminConfigDatabase(options: AdminConfigDatabaseOptions): RxDB {
  const userId = normalizeAdminUserId(options.userId);
  const plan = createMediaConfigSyncOptions({
    workspaceId: options.workspaceId,
    adapters: { local: 'sqlite-wasm', remote: 'supabase' }
  });
  const database = new RxDB({
    dbName: options.dbName,
    context: { userId },
    entities: [...ADMIN_CONFIG_ENTITIES],
    migrations: [templateAttributionMigration('sqlite')],
    sync: plan.sync,
    syncOverrides: plan.syncOverrides
  });
  database
    .use(rxDBPluginHistory)
    .use(rxDBPluginSync)
    .use(rxDBPluginQueryCache)
    .use(rxDBPluginWorkingTree)
    .adapter('sqlite-wasm', db => {
      const sqlite: SqliteOptions = {
        vfs: 'idb',
        wasmUrl: new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href
      };
      return new RxDBAdapterSqlite(db, sqlite);
    })
    .adapter(
      'supabase',
      db =>
        new RxDBAdapterSupabase(db, {
          client: options.supabase as unknown as RxdbSupabaseClient,
          rlsCheck: { failureMode: 'throw', tables: ADMIN_CONFIG_RLS_TABLES.map(table => ({ ...table })) }
        })
    );
  database.init();
  return database;
}
