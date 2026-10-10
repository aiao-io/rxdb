import { getEntityMetadata, RxDBChange, RxDBSync } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-wa-sqlite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LOCAL_RXDB_CHANGE_TABLE = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBChange));
export const LOCAL_RXDB_SYNC_TABLE = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBSync));

/**
 * Supabase 测试对 `rxdb_change` 的直写与清理统一走 service_role（零散收尾项第 13 条）。
 *
 * 开发/CI 的初始化链（init-db.sh 与 .github/actions/supabase）现在都会在 01～04 之后
 * 加载 docker/sql/production/rxdb-change-grants.sql：anon / authenticated 对
 * `rxdb_change` 只剩 SELECT，直接 INSERT/DELETE 一律 42501。测试里「模拟另一个客户端
 * 推送」的日志直插与「清场」不属于被测路径，改用本函数拿到的 service_role 客户端执行；
 * 以 anon 身份读（SELECT）不变，仍可用来断言拉取结果。
 *
 * 注意：service_role 会绕过 RLS —— 需要验证 RLS 拒绝路径的用例（如 push-receipts 用
 * authenticated 用户直写 `rls_todos`）不得改用本客户端，那些用例保持原样。
 */
let serviceRoleClient: SupabaseClient | null = null;

export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (serviceRoleClient) return serviceRoleClient;

  const url = import.meta.env['VITE_SUPABASE_URL'] || '';
  const serviceRoleKey = import.meta.env['VITE_SUPABASE_SERVICE_ROLE_KEY'] || '';
  if (!url || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY 缺失，无法构造 service_role 客户端');
  }
  serviceRoleClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return serviceRoleClient;
}

/** 以 service_role 清空远端 `rxdb_change`（整表，测试清场用） */
export async function clearRemoteRxdbChange(): Promise<void> {
  const { error } = await getSupabaseServiceRoleClient().from('rxdb_change').delete().neq('id', 0);
  if (error) throw error;
}

interface SqliteAdapterTestApi {
  rxdb?: { entityManager?: { cleanAllCache?: () => void } };
  internalQuery?: (sql: string) => Promise<unknown>;
}

/**
 * 清理 SQLite 适配器数据
 * 用于测试环境重置数据库状态
 */
export async function cleanupSqliteAdapter(adapter: RxDBAdapterWaSqlite): Promise<void> {
  try {
    const sqlite = adapter as unknown as RxDBAdapterWaSqlite & SqliteAdapterTestApi;

    if (typeof adapter.cleanAllCache === 'function') {
      await adapter.cleanAllCache();
    }
    if (sqlite.rxdb?.entityManager?.cleanAllCache) {
      sqlite.rxdb.entityManager.cleanAllCache();
    }

    if (typeof sqlite.internalQuery === 'function') {
      await sqlite.internalQuery('DELETE FROM public$todos');
      await sqlite.internalQuery(`DELETE FROM ${LOCAL_RXDB_CHANGE_TABLE}`);
      await sqlite.internalQuery(`DELETE FROM ${LOCAL_RXDB_SYNC_TABLE}`);
    }
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}
