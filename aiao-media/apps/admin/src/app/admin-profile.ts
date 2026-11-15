/** 当前管理员可维护的产品资料。 */
export interface AdminProfile {
  userId: string;
  displayName: string | null;
  revision: number;
  updatedAt: string | null;
  adminEnabled: boolean;
  accessDisabled: boolean;
}

/** Auth 系统身份的只读字段。 */
export interface AdminAccountIdentity {
  userId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

/** 名称限制为 1–40 个 Unicode 字符，不接受控制字符、孤立代理或方向控制符。 */
export function normalizeDisplayName(value: string): string {
  if (/[\p{Cc}\p{Cs}\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(value))
    throw new Error('名称不能包含控制字符或不可见方向字符。');
  const name = value.trim();
  if (!name || [...name].length > 40) throw new Error('名称需要 1–40 个字符，不能只有空白。');
  return name;
}

/** 资料缺失时仍提供可识别的身份入口。 */
export function accountLabel(name: string | null | undefined, email: string | null | undefined, userId: string): string {
  return name || email || userId.slice(0, 8);
}

/** 校验普通 RPC 的资料回执，禁止串号或不完整值覆盖界面。 */
export function parseAdminProfile(value: unknown, userId: string): AdminProfile {
  if (!value || typeof value !== 'object') throw new Error('账户资料回执无效。');
  const row = value as Record<string, unknown>;
  if (
    row['userId'] !== userId ||
    !(row['displayName'] === null || (typeof row['displayName'] === 'string' && normalizeDisplayName(row['displayName']) === row['displayName'])) ||
    !Number.isSafeInteger(row['revision']) || (row['revision'] as number) < 0 ||
    !(row['updatedAt'] === null || validDate(row['updatedAt'])) ||
    typeof row['adminEnabled'] !== 'boolean' || typeof row['accessDisabled'] !== 'boolean'
  ) throw new Error('账户资料回执无效。');
  return {
    userId,
    displayName: row['displayName'] as string | null,
    revision: row['revision'] as number,
    updatedAt: row['updatedAt'] as string | null,
    adminEnabled: row['adminEnabled'],
    accessDisabled: row['accessDisabled']
  };
}

/** 只接受服务端明确返回的当前账号身份字段。 */
export function parseAccountIdentity(value: unknown, userId: string): AdminAccountIdentity {
  if (!value || typeof value !== 'object') throw new Error('账号身份回执无效。');
  const row = value as Record<string, unknown>;
  if (
    row['userId'] !== userId || !(row['email'] === null || typeof row['email'] === 'string') ||
    !validDate(row['createdAt']) || !(row['lastSignInAt'] === null || validDate(row['lastSignInAt']))
  ) throw new Error('账号身份回执无效。');
  return { userId, email: row['email'] as string | null, createdAt: row['createdAt'] as string, lastSignInAt: row['lastSignInAt'] as string | null };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
