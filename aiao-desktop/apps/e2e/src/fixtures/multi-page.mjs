/**
 * 同一个浏览器上下文里的多个页面（ADESK-US-008 的「多页」夹具，给 ADESK-US-105 的多标签页验收）。
 *
 * 不同 BrowserContext 的存储互相隔离（OPFS、BroadcastChannel、Web Locks 都不共享），不能代表同一个浏览器里的
 * 多个标签页；要验证「一个标签页的改动出现在另一个标签页」，必须在同一个上下文里开多个页面。
 *
 * @param {import('playwright').BrowserContext} context 已创建的上下文（路由、权限等已配置好）
 * @param {number} count 页面数
 * @returns {Promise<import('playwright').Page[]>}
 */
export async function openPages(context, count) {
  const pages = [];
  for (let index = 0; index < count; index++) pages.push(await context.newPage());
  return pages;
}
