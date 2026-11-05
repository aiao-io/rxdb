/**
 * 管理后台的配置（US-713）：管理员名单与 service-role 凭据，都来自 Worker secret。
 *
 * @remarks
 * 名单用 Supabase 用户 id 而不是邮箱：测试项目关了邮箱确认，任何人都能注册一个自己并不拥有的邮箱，
 * 而用户 id 由 Supabase 分配，无法抢注。缺任何一项都报未配置，不降级成「谁都能进」。
 */
import { createAdminDirectory, type AdminDirectory } from './admin-supabase';
import { supabaseConfigOf, type Env } from './env';
import { UUID_PATTERN } from './identity';

/** 管理后台没配好：缺 secret，或名单写错。 */
export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminConfigError';
  }
}

/** 管理后台的运行配置。 */
export interface AdminConfig {
  /** 管理员的用户 id，统一小写。 */
  readonly adminIds: ReadonlySet<string>;
  /** 以 service role 访问 Supabase 的管理能力。 */
  readonly directory: AdminDirectory;
}

/**
 * 解析 `ADMIN_USER_IDS`：逗号或空白分隔的用户 id（uuid，大小写不论）。
 *
 * @throws AdminConfigError 有一项不是 uuid：写错就明说，不静默丢掉
 */
export const parseAdminIds = (raw: string): ReadonlySet<string> => {
  const ids = raw
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(id => id.toLowerCase());
  const invalid = ids.find(id => !UUID_PATTERN.test(id));
  if (invalid) throw new AdminConfigError(`ADMIN_USER_IDS must list Supabase user ids (uuid): "${invalid}" is not one`);
  return new Set(ids);
};

/**
 * 读管理后台的配置。
 *
 * @throws AdminConfigError 缺 `SUPABASE_SERVICE_ROLE_KEY` 或 `ADMIN_USER_IDS`，或名单写错
 * @throws Error 缺 `SUPABASE_URL` 或 `SUPABASE_ANON_KEY`
 */
export const adminConfigOf = (env: Env): AdminConfig => {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const rawIds = env.ADMIN_USER_IDS?.trim() ?? '';
  const missing = [
    ...(serviceRoleKey ? [] : ['SUPABASE_SERVICE_ROLE_KEY']),
    ...(rawIds ? [] : ['ADMIN_USER_IDS'])
  ];
  if (missing.length > 0) {
    throw new AdminConfigError(
      `admin console is not configured: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} missing`
    );
  }
  const adminIds = parseAdminIds(rawIds);
  if (adminIds.size === 0) throw new AdminConfigError('ADMIN_USER_IDS lists no user id');
  const { url, fetch } = supabaseConfigOf(env);
  return { adminIds, directory: createAdminDirectory({ url, serviceRoleKey, fetch }) };
};
