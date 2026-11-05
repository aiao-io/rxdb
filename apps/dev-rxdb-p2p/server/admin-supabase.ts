/**
 * 管理后台访问 Supabase 的客户端（US-713）：账号经 Auth Admin API，设备与清单统计经 `p2p.admin_*` 数据库函数。
 *
 * @remarks
 * 一律以 service role 身份调用，key 只存在于 Worker secret。数据库函数只对 `service_role` 开放 `EXECUTE`
 * （见 `supabase/p2p-schema.sql`），普通登录用户直接调用会被数据库拒绝。
 */
import { ADMIN_ACCOUNTS_PAGE_SIZE } from '../shared/admin-protocol';

/** 访问 Supabase 管理接口的参数；`fetch` 可注入以便测试。 */
export interface AdminSupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch: typeof fetch;
}

/** Auth Admin API 返回的一个账号（只取用到的字段）。 */
export interface AuthUser {
  readonly id: string;
  /** 登录邮箱；没有邮箱的账号用 id 代替。 */
  readonly email: string;
  readonly createdAt: string;
  readonly lastSignInAt: string | null;
  /** `banned_until` 原值，是否仍在封禁中由 `isBanned` 判定。 */
  readonly bannedUntil: string | null;
}

/** 一个账号名下的设备数与持有声明数。 */
export interface AccountStats {
  readonly userId: string;
  readonly deviceCount: number;
  readonly claimCount: number;
}

/** 清单里一个文件的汇总。 */
export interface FileCatalogEntry {
  readonly contentHash: string;
  readonly fileName: string;
  readonly holderCount: number;
}

/** 管理接口要用的 Supabase 能力。 */
export interface AdminDirectory {
  /** 一页账号与账号总数。 */
  listAccounts(page: number): Promise<{ readonly users: readonly AuthUser[]; readonly total: number }>;
  /** 每个有设备的账号的设备数与声明数。 */
  accountStats(): Promise<readonly AccountStats[]>;
  /** 清单里每个内容哈希的文件名与持有者数。 */
  fileCatalog(): Promise<readonly FileCatalogEntry[]>;
  /** 封禁或解封账号。 */
  setBanned(userId: string, banned: boolean): Promise<void>;
  /**
   * 在一条语句里清掉账号的全部持有声明与设备登记，返回清掉的声明数；幂等。
   * 设备一并清掉，是为了让账号在被删除之前就既握不了手、也写不了新的声明。
   */
  purgeAccount(userId: string): Promise<number>;
  /** 删除账号；设备登记随账号级联删除。 */
  deleteAccount(userId: string): Promise<void>;
}

/** Auth Admin API 说这个账号不存在。 */
export class AccountNotFoundError extends Error {
  constructor(readonly userId: string) {
    super(`account ${userId} does not exist`);
    this.name = 'AccountNotFoundError';
  }
}

/** 约一百年，等同永久封禁；GoTrue 按 Go 的时长格式解析。 */
const BAN_FOREVER = '876000h';
/** 解除封禁。 */
const BAN_NONE = 'none';
const AUTH_ADMIN = 'Supabase Auth admin';
const POSTGREST = 'PostgREST';

interface RawAuthUser {
  readonly id: string;
  readonly email?: string | null;
  readonly created_at: string;
  readonly last_sign_in_at?: string | null;
  readonly banned_until?: string | null;
}

const toAuthUser = (raw: RawAuthUser): AuthUser => ({
  id: raw.id,
  email: raw.email || raw.id,
  createdAt: raw.created_at,
  lastSignInAt: raw.last_sign_in_at ?? null,
  bannedUntil: raw.banned_until ?? null
});

/** 上游拒绝时的错误：带状态码与它自己给的说明，好让管理员知道缺了什么（例如表结构还没更新）。 */
const failure = async (label: string, response: Response): Promise<Error> => {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const message = [body?.['msg'], body?.['message'], body?.['error_description']].find(
    (field): field is string => typeof field === 'string' && field.length > 0
  );
  return new Error(`${label} responded ${response.status}${message ? `: ${message}` : ''}`);
};

/** 以 service role 身份访问 Supabase 的管理能力。 */
export const createAdminDirectory = (config: AdminSupabaseConfig): AdminDirectory => {
  const credentials = { apikey: config.serviceRoleKey, authorization: `Bearer ${config.serviceRoleKey}` };

  const rpc = async <T>(name: string, args: unknown): Promise<T> => {
    const response = await config.fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...credentials, 'content-type': 'application/json', 'content-profile': 'p2p' },
      body: JSON.stringify(args)
    });
    if (!response.ok) throw await failure(POSTGREST, response);
    return (await response.json()) as T;
  };

  const changeAccount = async (userId: string, method: 'PUT' | 'DELETE', body?: unknown): Promise<void> => {
    const response = await config.fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method,
      headers: { ...credentials, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (response.status === 404) throw new AccountNotFoundError(userId);
    if (!response.ok) throw await failure(AUTH_ADMIN, response);
  };

  return {
    async listAccounts(page) {
      const query = new URLSearchParams({ page: String(page), per_page: String(ADMIN_ACCOUNTS_PAGE_SIZE) });
      const response = await config.fetch(`${config.url}/auth/v1/admin/users?${query}`, { headers: credentials });
      if (!response.ok) throw await failure(AUTH_ADMIN, response);
      const count = response.headers.get('x-total-count') ?? '';
      if (!/^\d+$/.test(count)) throw new Error('Supabase Auth returned no total count');
      const { users } = (await response.json()) as { readonly users: readonly RawAuthUser[] };
      return { users: users.map(toAuthUser), total: Number(count) };
    },

    async accountStats() {
      const rows = await rpc<readonly { user_id: string; device_count: number; claim_count: number }[]>(
        'admin_account_stats',
        {}
      );
      return rows.map(row => ({
        userId: row.user_id,
        deviceCount: Number(row.device_count),
        claimCount: Number(row.claim_count)
      }));
    },

    async fileCatalog() {
      const rows = await rpc<readonly { content_hash: string; file_name: string; holder_count: number }[]>(
        'admin_file_catalog',
        {}
      );
      return rows.map(row => ({
        contentHash: row.content_hash,
        fileName: row.file_name,
        holderCount: Number(row.holder_count)
      }));
    },

    setBanned: (userId, banned) => changeAccount(userId, 'PUT', { ban_duration: banned ? BAN_FOREVER : BAN_NONE }),

    async purgeAccount(userId) {
      const purged = await rpc<unknown>('admin_purge_account', { target: userId });
      if (typeof purged !== 'number') throw new Error('admin_purge_account returned no count');
      return purged;
    },

    deleteAccount: userId => changeAccount(userId, 'DELETE')
  };
};
