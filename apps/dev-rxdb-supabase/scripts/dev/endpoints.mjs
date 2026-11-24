/** 应用 dev server 的固定端口，与 project.json 里 serve 的 port 一致 */
export const appPort = 4203;
/** 测试起始页的固定端口，只监听 127.0.0.1 */
export const dashboardPort = 4204;
/** 应用对外的 origin：本地库、Supabase 会话都按 origin 隔离，入口统一用 localhost */
export const appUrl = `http://localhost:${appPort}`;
export const dashboardUrl = `http://127.0.0.1:${dashboardPort}/`;
