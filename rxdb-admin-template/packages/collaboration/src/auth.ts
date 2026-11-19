/**
 * 全局认证的轻量入口（`@rxdb-admin-template/collaboration/auth`）：全局登录会话、登录页、顶栏账号菜单与回跳地址校验。
 * 三端应用的外壳（路由守卫、顶栏）在首屏就要用到它们，从这里导入不会把团队协作的其余代码带进首屏。
 */
export { mountAccount, type AccountMenuOptions } from './client/account-menu.js';
export { carriesInvitation } from './client/invitation-link.js';
export { mountLogin, type LoginPageOptions } from './client/login-page.js';
export { AuthSession, authSession, type AuthConfig, type MessageTone } from './client/session.js';

/**
 * 登录之后回到哪里：只接受本站的绝对路径（以单个 `/` 开头），其余一律回首页，防止 `redirect` 参数被用来跳到别的站点。
 * @param value 登录页地址里的 `redirect` 参数。
 */
export function redirectTarget(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}
