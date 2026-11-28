/**
 * 夹具服务的地址：由 `playwright.config.ts` 按测试目标设好——本机拓扑是 `browser-server.mjs` 的 8309，
 * 已部署目标（ADMIN-US-217 AC#5）是 `deployed-fixtures.mjs` 监听的 `ADMIN_E2E_FIXTURES_PORT`。不经那份配置运行时直接报错。
 */
function fixturesUrl(): string {
  const value = process.env['ADMIN_E2E_FIXTURES'];
  if (!value) throw new Error('ADMIN_E2E_FIXTURES is not set: run the specs through playwright.config.ts');
  return value;
}
export const fixtures = fixturesUrl();
