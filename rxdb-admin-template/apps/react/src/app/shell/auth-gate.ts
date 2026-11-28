import { authSession } from '@rxdb-admin-template/collaboration/auth';
import { redirect } from 'react-router-dom';

/** 登录页地址：带上登录之后要回到的地址（路径 + 查询 + 片段）。 */
export function loginUrl(target: string): string {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/**
 * 全站登录门禁（布局路由的 loader）：先等全局会话恢复身份，没有登录就带着原地址去登录页。
 * 会话建不起来（例如读不到公开配置）也按未登录处理，登录页会重试并显示原因。
 * 首次打开时片段（邀请链接的 `#join=…`）不在请求地址里，从浏览器地址补上。
 */
export async function requireLogin({ request }: { request: Request }): Promise<null> {
  const session = authSession();
  await session.initialize().catch(() => undefined);
  if (session.user) return null;
  const url = new URL(request.url);
  const hash = url.pathname === window.location.pathname ? window.location.hash : '';
  throw redirect(loginUrl(`${url.pathname}${url.search}${hash}`));
}
