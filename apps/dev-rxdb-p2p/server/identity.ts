/**
 * 认证宿主（Supabase）的服务端校验：token 由 Supabase Auth 解析成用户，设备归属按用户身份经 PostgREST 查询。
 *
 * @remarks
 * 401 / 403 与账号被封禁都是「凭据无效」，返回 null；其它非 2xx 是认证宿主自己出了问题，抛错交给调用方报
 * `server_error`，不把服务端故障说成用户没通过认证。
 */

/** 访问 Supabase 的参数；`fetch` 可注入以便测试。 */
export interface SupabaseAuthConfig {
  readonly url: string;
  readonly anonKey: string;
  readonly fetch: typeof fetch;
}

/** Supabase Auth 认定的用户。 */
export interface VerifiedUser {
  readonly id: string;
  readonly email: string;
}

/** 用户登记过的设备。 */
export interface OwnDevice {
  readonly id: string;
  readonly name: string;
}

/** uuid 的规范文本（Supabase 的用户 id、设备 id），大小写不论。 */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REJECTED_TOKEN_STATUSES = new Set([401, 403]);

const asUser = (accessToken: string, config: SupabaseAuthConfig): HeadersInit => ({
  apikey: config.anonKey,
  authorization: `Bearer ${accessToken}`
});

/**
 * 账号此刻是否处于封禁中。
 *
 * @remarks
 * Supabase Auth 的 `banned_until` 为 `null` 或缺省表示没有封禁；是时间就看它是否还在未来。
 * 读不懂的值按封禁处理：宁可误拒，也不放行一个状态不明的账号。
 */
export const isBanned = (bannedUntil: unknown): boolean => {
  if (bannedUntil === null || bannedUntil === undefined) return false;
  return !(typeof bannedUntil === 'string' && Date.parse(bannedUntil) <= Date.now());
};

/**
 * 用 Supabase Auth 解析 access token。
 *
 * @remarks
 * 被封禁的账号，手里已签发的 token 在 Supabase 侧要到过期才失效；这里按 `banned_until` 实时判定，视同 token 无效。
 *
 * @returns 用户；token 无效、过期或账号被封禁时为 null
 * @throws Error 认证宿主返回其它错误
 */
export const verifyAccessToken = async (
  config: SupabaseAuthConfig,
  accessToken: string
): Promise<VerifiedUser | null> => {
  const response = await config.fetch(`${config.url}/auth/v1/user`, { headers: asUser(accessToken, config) });
  if (REJECTED_TOKEN_STATUSES.has(response.status)) return null;
  if (!response.ok) throw new Error(`Supabase Auth responded ${response.status}`);
  const user = (await response.json()) as {
    readonly id?: unknown;
    readonly email?: unknown;
    readonly banned_until?: unknown;
  };
  if (typeof user.id !== 'string' || !user.id) throw new Error('Supabase Auth returned no user id');
  if (isBanned(user.banned_until)) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : user.id };
};

/**
 * 以用户身份查询一台设备：RLS 只放行本人登记的设备，查不到即不属于该用户。
 *
 * @returns 设备；不存在或不属于该用户时为 null
 * @throws Error PostgREST 返回错误
 */
export const findOwnDevice = async (
  config: SupabaseAuthConfig,
  accessToken: string,
  deviceId: string
): Promise<OwnDevice | null> => {
  if (!UUID_PATTERN.test(deviceId)) return null;
  const query = new URLSearchParams({ id: `eq.${deviceId}`, select: 'id,name' });
  const response = await config.fetch(`${config.url}/rest/v1/devices?${query}`, {
    headers: { ...asUser(accessToken, config), 'accept-profile': 'p2p' }
  });
  if (!response.ok) throw new Error(`PostgREST responded ${response.status}`);
  const [device] = (await response.json()) as OwnDevice[];
  return device ?? null;
};
