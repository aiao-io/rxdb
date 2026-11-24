import { RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 会话相关函数用到的认证能力子集，便于测试替身。 */
export type SupabaseSessionAuth = Pick<
  SupabaseClient['auth'],
  'getSession' | 'signInAnonymously' | 'signInWithPassword' | 'signOut' | 'signUp'
>;

/**
 * demo 的身份种类。
 *
 * - `visitor`：没有会话，以 anon 身份同步与浏览公开数据（epic-015：公开数据给 anon，不靠匿名账号）
 * - `anonymous`：Supabase 匿名登录的用户，数据库角色是 authenticated，用来演示 Todo 的日志推送
 * - `account`：邮箱账号，按所在租户读写
 */
export type DemoIdentityKind = 'visitor' | 'anonymous' | 'account';

/** 会话属于谁。本地库按 `subject` 命名并绑定（US-035）。 */
export interface DemoSessionIdentity {
  readonly kind: DemoIdentityKind;
  /** `RxDBIdentity.subject`：访客是 {@link RXDB_ANONYMOUS_SUBJECT}，登录身份是用户 id */
  readonly subject: string;
  /** 账号的邮箱；访客与匿名用户没有 */
  readonly email: string | null;
}

/** 预置的演示账号：第一次用时注册，并加入各自的默认租户。 */
export interface DemoAccount {
  readonly id: string;
  readonly label: string;
  readonly email: string;
  /** 只用于本地隔离栈的演示口令 */
  readonly password: string;
  /** 注册时加入的租户（`demo_tenants.id`） */
  readonly tenantId: string;
  /** 租户的名字，与 `demo_tenants.name` 一致；切换身份的菜单在连上远端之前就要显示 */
  readonly tenantName: string;
}

/** Alice 在星河零售，Bob 在极光百货：两个用户、两个租户（US-033 AC#2）。 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    id: 'alice',
    label: 'Alice',
    email: 'alice@example.com',
    password: 'rxdb-demo-alice',
    tenantId: 'xinghe',
    tenantName: '星河零售'
  },
  {
    id: 'bob',
    label: 'Bob',
    email: 'bob@example.com',
    password: 'rxdb-demo-bob',
    tenantId: 'jiguang',
    tenantName: '极光百货'
  }
];

/**
 * 读出当前会话属于谁，不替用户登录。
 *
 * @param auth - Supabase 客户端的 `auth`
 * @returns 没有会话是访客；有会话按是否匿名分成匿名用户与账号
 * @throws 读会话失败时透传 Supabase 的错误，不当成访客：当成访客就会打开另一个身份的库
 *
 * @remarks
 * 访客的身份在本机就能确定，所以第一次打开不需要联网；登录状态保存在浏览器里，刷新后沿用。
 */
export async function readSessionIdentity(auth: Pick<SupabaseSessionAuth, 'getSession'>): Promise<DemoSessionIdentity> {
  const { data, error } = await auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) return { kind: 'visitor', subject: RXDB_ANONYMOUS_SUBJECT, email: null };
  return { kind: user.is_anonymous ? 'anonymous' : 'account', subject: user.id, email: user.email ?? null };
}

/**
 * 退出登录，回到访客。
 *
 * @remarks
 * 只清本机会话（`scope: 'local'`），不吊销账号在别的设备上的登录，也不需要联网。
 */
export async function signOutToVisitor(auth: Pick<SupabaseSessionAuth, 'signOut'>): Promise<void> {
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) throw error;
}

/**
 * 匿名登录：得到一个新的匿名用户（数据库角色 authenticated）。
 *
 * @throws 部署没有开启匿名登录等情况下透传 Supabase 的错误
 */
export async function signInAnonymousUser(auth: Pick<SupabaseSessionAuth, 'signInAnonymously'>): Promise<void> {
  const { error } = await auth.signInAnonymously();
  if (error) throw error;
}

/**
 * 以预置账号登录；账号还不存在时注册。
 *
 * @param auth - Supabase 客户端的 `auth`
 * @param account - 预置账号
 * @param onSignedUp - 注册成功、会话已经建好之后调用（加入默认租户）；之后再登录不再调用，
 *   演示过程中退出的租户不会因为重新登录又加回来
 * @throws 登录失败但不是凭据错误时原样抛出；注册后拿不到会话（部署要求邮箱确认）时报错
 */
export async function signInDemoAccount(
  auth: Pick<SupabaseSessionAuth, 'signInWithPassword' | 'signUp'>,
  account: DemoAccount,
  onSignedUp: () => Promise<void>
): Promise<void> {
  const credentials = { email: account.email, password: account.password };
  const signedIn = await auth.signInWithPassword(credentials);
  if (!signedIn.error) return;
  if (signedIn.error.code !== 'invalid_credentials') throw signedIn.error;

  const signedUp = await auth.signUp(credentials);
  if (signedUp.error) throw signedUp.error;
  if (!signedUp.data.session) {
    throw new Error(
      `${account.email} 注册后没有拿到会话：Supabase 项目开启了邮箱确认，演示账号需要关闭它（或开启自动确认）`
    );
  }
  await onSignedUp();
}
