import { RxDB, SyncType, type EntitySyncOverride, type EntityType, type SyncOptions } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertBackendRxdbAuth, type BackendRxdbAuth } from './backend-rxdb-auth.ts';

type RxdbSupabaseClient = NonNullable<ConstructorParameters<typeof RxDBAdapterSupabase>[1]['client']>;

export { assertBackendRxdbAuth, BackendRxdbAuthProvider } from './backend-rxdb-auth.ts';
export type { BackendRxdbAuth } from './backend-rxdb-auth.ts';

export interface BackendRxdbOptions {
  dbName: string;
  entities: EntityType[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  auth: BackendRxdbAuth;
  /** 为业务实体启用固定工作区过滤，避免后台节点把其他工作区带入本地库。 */
  workspaceId?: string;
  /** 默认所有传入实体都按 workspaceId 过滤；传入该列表可显式收窄范围。 */
  workspaceScopedEntities?: readonly EntityType[];
  /** 后台需要使用 branch/commit 时启用工作树能力。 */
  enableWorkingTree?: boolean;
  store?: 'memory' | 'idb';
  rlsTables?: Array<{ schema?: string; table: string }>;
  /** 显式同步计划；给出时替代按 workspaceId 生成的默认计划，例如配置同步白名单。 */
  syncPlan?: { sync: SyncOptions; syncOverrides?: readonly EntitySyncOverride[] };
}

/** 配置同步节点需要 RLS 自检的远端表。 */
export const BACKEND_CONFIG_RLS_TABLES: ReadonlyArray<{ schema: string; table: string }> = Object.freeze([
  { schema: 'public', table: 'media_prompt_templates' },
  { schema: 'public', table: 'media_provider_policies' },
  { schema: 'public', table: 'media_platform_models' },
  { schema: 'public', table: 'media_config_projection_commits' },
  { schema: 'public', table: 'media_config_projection_changes' }
]);

export interface BackendRxdbSession {
  readonly db: RxDB;
  readonly supabase: SupabaseClient;
  close(): Promise<void>;
}

export function createBackendSupabaseHeaders(anonKey: string, accessToken: string): Record<string, string> {
  if (!anonKey || anonKey.includes('service_role') || anonKey.includes('secret'))
    throw new Error('publishable Supabase key is required');
  return { apikey: anonKey, authorization: `Bearer ${accessToken}` };
}

/** 校验工作区 ID，避免把任意用户输入拼进同步过滤条件。 */
export function assertBackendWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('workspaceId must be a UUID');
  }
  return normalized;
}

/** 为后台同步节点生成普通 JWT 可用的同步配置。 */
export function createBackendRxdbSyncConfig(
  options: Pick<BackendRxdbOptions, 'entities' | 'workspaceId' | 'workspaceScopedEntities'>
): { sync: SyncOptions; syncOverrides?: readonly { entity: EntityType; sync: SyncOptions }[] } {
  const sync: SyncOptions = {
    type: SyncType.Full,
    local: { adapter: 'pglite' },
    remote: { adapter: 'supabase' }
  };
  if (!options.workspaceId) return { sync };

  const workspaceId = assertBackendWorkspaceId(options.workspaceId);
  const entities = options.workspaceScopedEntities ?? options.entities;
  const syncOverrides = entities.map(entity => ({
    entity,
    sync: {
      type: SyncType.Filter,
      local: { adapter: 'pglite' },
      remote: {
        adapter: 'supabase',
        filter: () => ({
          combinator: 'and' as const,
          rules: [{ field: 'workspaceId', operator: '=' as const, value: workspaceId }]
        })
      }
    } satisfies SyncOptions
  }));
  return { sync, syncOverrides };
}

function supabaseUrl(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Supabase URL is invalid');
  return url.origin;
}

function usesQueryCache(plan: { sync: SyncOptions; syncOverrides?: readonly EntitySyncOverride[] }): boolean {
  return (
    plan.sync.type === SyncType.QueryCache ||
    (plan.syncOverrides ?? []).some(item => item.sync.type === SyncType.QueryCache)
  );
}

export async function openBackendRxdb(options: BackendRxdbOptions): Promise<BackendRxdbSession> {
  assertBackendRxdbAuth(options.auth);
  const syncConfig = options.syncPlan ?? createBackendRxdbSyncConfig(options);
  const url = supabaseUrl(options.supabaseUrl);
  const headers = createBackendSupabaseHeaders(options.supabaseAnonKey, options.auth.accessToken);
  const supabase = createClient(url, options.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers }
  });
  supabase.realtime.setAuth(options.auth.accessToken);

  const db = new RxDB({
    dbName: options.dbName,
    context: { userId: options.auth.userId },
    entities: options.entities,
    sync: syncConfig.sync,
    syncOverrides: syncConfig.syncOverrides
  });
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSync);
  if (usesQueryCache(syncConfig)) db.use(rxDBPluginQueryCache);
  db.use(rxDBPluginWorkingTree, {
    worktrees: { adapter: database => new RxDBAdapterPGlite(database, { store: options.store ?? 'memory' }) }
  });
  db.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: options.store ?? 'memory' }));
  db.adapter(
    'supabase',
    database =>
      new RxDBAdapterSupabase(database, {
        client: supabase as unknown as RxdbSupabaseClient,
        rlsCheck: {
          failureMode: 'throw',
          tables: options.rlsTables ?? [{ schema: 'public', table: 'media_sync_records' }]
        }
      })
  );

  try {
    await db.connect('pglite');
    await db.connect('supabase');
    if (options.enableWorkingTree !== false) await db.workingTree.enable();
  } catch (error) {
    await db.destroy();
    throw error;
  }
  return {
    db,
    supabase,
    close: () => db.destroy()
  };
}

/** {@link openBackendConfigRxdb} 的输入：配置同步固定实体与适配器，只需身份与工作区。 */
export type BackendConfigRxdbOptions = Omit<
  BackendRxdbOptions,
  'entities' | 'workspaceScopedEntities' | 'syncPlan' | 'rlsTables'
> & {
  workspaceId: string;
};

/**
 * 打开配置同步节点：配置实体按工作区双向同步，提交投影按查询缓存读写。
 *
 * @remarks
 * 实体集合固定为领域白名单，RxDB 内部系统实体（含工作树提交图）由领域层拒绝进入同步。
 * 领域包使用装饰器，Node 原生类型剥离无法直接加载，因此在调用时动态导入。
 */
export async function openBackendConfigRxdb(options: BackendConfigRxdbOptions): Promise<BackendRxdbSession> {
  const { MEDIA_CONFIG_SYNC_ENTITIES, createMediaConfigSyncOptions } = await import('@aiao-media/domain');
  const workspaceId = assertBackendWorkspaceId(options.workspaceId);
  const plan = createMediaConfigSyncOptions({ workspaceId, adapters: { local: 'pglite', remote: 'supabase' } });
  return openBackendRxdb({
    ...options,
    workspaceId,
    entities: [...MEDIA_CONFIG_SYNC_ENTITIES],
    syncPlan: plan,
    rlsTables: BACKEND_CONFIG_RLS_TABLES.map(table => ({ ...table }))
  });
}
