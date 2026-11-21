import { getEntityMetadata, RxDBChange, RxDBSync, WorktreeTableSet } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-wa-sqlite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LOCAL_RXDB_CHANGE_TABLE = sqliteGetTableNameByMetadata(
  getEntityMetadata(RxDBChange),
  WorktreeTableSet.MAIN
);
export const LOCAL_RXDB_SYNC_TABLE = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBSync), WorktreeTableSet.MAIN);

/**
 * 测试默认的已登录用户（US-225：日志同步协议只对已登录身份开放，anon 拉不到日志、推不了变更）。
 *
 * @remarks
 * 固定值而不是每次随机：测试写入的数据跨运行留在测试栈里，非 main 分支的所有者也一样——换了用户，
 * 上一轮认领过的分支就推不进去了。需要第二个用户的用例显式传 `userId`。
 * 本地栈若在所有者表出现之前就跑过分支用例，会留下没有所有者的旧分支，推送报「has no owner」：
 * 跑一次 `nx run rxdb-adapter-supabase:test-env-down` 再重起即可。
 */
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000225';

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const encodeJson = (value: object): string => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function signAccessToken(userId: string): Promise<string> {
  const secret = import.meta.env['VITE_SUPABASE_JWT_SECRET'] || '';
  if (!secret) {
    throw new Error('VITE_SUPABASE_JWT_SECRET 缺失，无法签发测试用的 authenticated 令牌');
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 24 * 60 * 60 };
  const unsigned = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

const accessTokens = new Map<string, Promise<string>>();

/**
 * 以测试栈的 JWT 密钥签发 authenticated 访问令牌（测试跑在浏览器里，用 WebCrypto 的 HMAC-SHA256；同一用户只签一次）。
 *
 * @param userId - 令牌的 `sub`，即 `auth.uid()`
 * @returns 与 GoTrue 签发的访问令牌同形的 HS256 JWT，PostgREST 与 Realtime 都据它切换到 authenticated 角色
 */
export function signTestAccessToken(userId: string = TEST_USER_ID): Promise<string> {
  let token = accessTokens.get(userId);
  if (!token) {
    token = signAccessToken(userId);
    accessTokens.set(userId, token);
  }
  return token;
}

/**
 * 以测试用户的身份新建一个 Supabase 客户端。
 *
 * @remarks
 * apikey 仍是 anon key（Kong 只认 anon 与 service_role 两把 key），用户身份经 `accessToken` 放进
 * Authorization 头，Realtime 加入私有频道时也用它。每次调用都新建：多个 RxDB 实例各用各的客户端，
 * 就像同一个用户的多台设备。
 *
 * @param userId - 客户端代表的用户，默认 {@link TEST_USER_ID}
 */
export function createAuthenticatedTestClient(userId: string = TEST_USER_ID): SupabaseClient {
  const url = import.meta.env['VITE_SUPABASE_URL'] || '';
  const anonKey = import.meta.env['VITE_SUPABASE_KEY'] || '';
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_KEY 缺失，无法构造测试客户端');
  }
  return createClient(url, anonKey, { accessToken: () => signTestAccessToken(userId) });
}

/**
 * Supabase 测试对 `rxdb_change` 的直写与清理统一走 service_role（零散收尾项第 13 条）。
 *
 * 开发/CI 的初始化链（init-db.sh 与 .github/actions/supabase）现在都会在 01～04 之后
 * 加载 docker/sql/production/rxdb-change-grants.sql：客户端对 `rxdb_change` 至多只有 SELECT，
 * 直接 INSERT/DELETE 一律 42501；anon 连 SELECT 都没有。测试里「模拟另一个客户端推送」的
 * 日志直插与「清场」不属于被测路径，改用本函数拿到的 service_role 客户端执行；
 * 断言拉取结果用 {@link createAuthenticatedTestClient} 的客户端读。
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
