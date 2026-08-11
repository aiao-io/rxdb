const USER_ID_KEY = 'dev-rxdb-supabase:user-id';
const DEFAULT_DATABASE_NAME = 'dev-rxdb-supabase';

/** 本 app 关心的构建期注入变量（`import.meta.env` 的子集）。 */
export interface RuntimeEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 校验通过的 Supabase 连接参数。 */
export interface SupabaseRuntimeConfig {
  readonly url: string;
  readonly key: string;
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return (JSON.parse(decoded) as { role?: unknown }).role === 'anon';
  } catch {
    return false;
  }
}

/**
 * 读取并校验 Supabase 连接参数。
 *
 * @param env - 构建期注入的环境变量
 * @returns 校验通过的 url / key
 * @throws {@link Error} 缺少任一变量，或 key 不是公开的 anon / publishable key 时
 *
 * @remarks
 * 这里**只挡运行时**。key 在构建期就已经被 Vite 内联进产物，
 * 真正的防线是 `project.json` 里 production 配置的 `define`（见 P2-2）。
 */
export function readSupabaseConfig(env: RuntimeEnv): SupabaseRuntimeConfig {
  const url = normalize(env.VITE_SUPABASE_URL);
  const key = normalize(env.VITE_SUPABASE_KEY);
  if (!url || !key) {
    const missing = [!url ? 'VITE_SUPABASE_URL' : null, !key ? 'VITE_SUPABASE_KEY' : null].filter(
      (name): name is string => name !== null
    );
    throw new Error(`Missing Supabase configuration: ${missing.join(', ')}`);
  }
  if (!isPublicSupabaseKey(key)) {
    throw new Error('VITE_SUPABASE_KEY must be a public anon or publishable key');
  }
  return { url, key };
}

/**
 * 取得当前浏览器的用户标识：显式配置 > 已存储 > 新建并持久化。
 *
 * @param configuredUserId - `VITE_RXDB_USER_ID`，留空则走存储
 * @param storage - 持久化载体（生产传 `localStorage`）
 * @param createId - 新建 id 的方式（生产传 `crypto.randomUUID`）
 *
 * @remarks
 * 这个 id 会被适配器原样写进 `createdBy` / `updatedBy`，**服务端不做任何校验**（见 P0-1）。
 * 它是 demo 身份，不是认证身份。
 */
export function getOrCreateUserId(
  configuredUserId: string | undefined,
  storage: KeyValueStorage,
  createId: () => string
): string {
  const configured = normalize(configuredUserId);
  if (configured) return configured;
  const existing = normalize(storage.getItem(USER_ID_KEY) ?? undefined);
  if (existing) return existing;
  const created = createId();
  storage.setItem(USER_ID_KEY, created);
  return created;
}

/**
 * 解析本地数据库名。
 *
 * @param configuredName - `VITE_RXDB_DB_NAME`；空白视为未配置
 * @returns 配置值，或默认库名
 */
export function resolveDatabaseName(configuredName: string | undefined): string {
  return normalize(configuredName) ?? DEFAULT_DATABASE_NAME;
}
