import { DEMO_ACCOUNTS, type DemoSessionIdentity } from './supabase-session';

/** 切换身份菜单里的一项。`key` 是访客、匿名用户，或预置账号的 id。 */
export interface IdentityChoice {
  readonly key: string;
  readonly label: string;
}

/** 切换身份的菜单：访客、匿名用户、两个分属不同租户的预置账号。 */
export const IDENTITY_CHOICES: readonly IdentityChoice[] = [
  { key: 'visitor', label: '访客（不登录）' },
  { key: 'anonymous', label: '匿名用户' },
  ...DEMO_ACCOUNTS.map(account => ({ key: account.id, label: `${account.label}（${account.tenantName}）` }))
];

/**
 * 当前会话对应菜单里的哪一项。
 *
 * @returns 选项的 `key`；以预置账号之外的账号登录时为 `null`
 */
export function currentIdentityChoice(identity: DemoSessionIdentity): string | null {
  if (identity.kind !== 'account') return identity.kind;
  return DEMO_ACCOUNTS.find(account => account.email === identity.email)?.id ?? null;
}

/** 在页面上怎么称呼当前身份。 */
export interface IdentityDescription {
  readonly title: string;
  readonly detail: string;
}

/** 给当前身份一个名字和一行说明。 */
export function describeIdentity(identity: DemoSessionIdentity): IdentityDescription {
  if (identity.kind === 'visitor') return { title: '访客', detail: '未登录 · 以 anon 读公开数据' };
  if (identity.kind === 'anonymous') return { title: '匿名用户', detail: '匿名登录 · 数据库角色 authenticated' };
  const account = DEMO_ACCOUNTS.find(item => item.email === identity.email);
  if (!account) return { title: identity.email ?? '账号', detail: '账号' };
  return { title: account.label, detail: `${account.tenantName} · ${account.email}` };
}
