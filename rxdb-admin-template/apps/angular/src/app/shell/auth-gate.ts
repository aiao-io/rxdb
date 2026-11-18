import { inject } from '@angular/core';
import { Router, type CanActivateChildFn } from '@angular/router';
import { authSession } from '@rxdb-admin-template/collaboration/auth';

/** 登录页地址：带上登录之后要回到的地址（路径 + 查询 + 片段）。 */
export function loginUrl(target: string): string {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/**
 * 全站登录门禁（外壳路由的 `canActivateChild`）：先等全局会话恢复身份，没有登录就带着原地址去登录页。
 * 会话建不起来（例如读不到公开配置）也按未登录处理，登录页会重试并显示原因。
 */
export const requireLogin: CanActivateChildFn = async (_route, state) => {
  const session = authSession();
  const router = inject(Router);
  await session.initialize().catch(() => undefined);
  return session.user ? true : router.parseUrl(loginUrl(state.url));
};
