import { authSession } from '@rxdb-admin-template/collaboration/auth';
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

/** 登录页地址：带上登录之后要回到的地址（路径 + 查询 + 片段）。 */
export function loginUrl(target: string): string {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/**
 * 全站登录门禁（`router.beforeEach`）：登录页之外的页面先等全局会话恢复身份，没有登录就带着原地址去登录页。
 * 会话建不起来（例如读不到公开配置）也按未登录处理，登录页会重试并显示原因。
 */
export async function requireLogin(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  if (to.path === '/login') return true;
  const session = authSession();
  await session.initialize().catch(() => undefined);
  return session.user ? true : loginUrl(to.fullPath);
}
