import type { SupabaseClient } from '@supabase/supabase-js';

/** {@link ensureSupabaseSession} 用到的认证能力子集，便于测试替身。 */
export type SupabaseSessionAuth = Pick<SupabaseClient['auth'], 'getSession' | 'signInAnonymously'>;

/**
 * 确保客户端已有登录会话：没有就匿名登录。
 *
 * @param auth - Supabase 客户端的 `auth`
 * @returns 会话所属用户的 id；本地库按它命名（US-035），刷新后沿用同一个会话，所以还是同一个库
 * @throws 读会话或匿名登录失败时透传 Supabase 的错误（例如部署没有开启匿名登录）；匿名登录没有返回用户时也抛，不猜是谁
 *
 * @remarks
 * 日志同步只对已登录身份开放（US-225），anon key 本身拉不到日志、推不了变更。Supabase 匿名用户的
 * 数据库角色是 authenticated，所以在开启了匿名登录的部署上，任何访客都能读到同步日志——这个 demo
 * 的数据本来公开；生产环境应关闭匿名登录，改用正式登录。会话保存在浏览器里，刷新后仍是同一个匿名用户。
 */
export async function ensureSupabaseSession(auth: SupabaseSessionAuth): Promise<string> {
  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user.id;

  const { data: signedIn, error: signInError } = await auth.signInAnonymously();
  if (signInError) throw signInError;
  if (!signedIn.user) throw new Error('Anonymous sign-in returned no user; cannot tell which local database to open.');
  return signedIn.user.id;
}
