import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';

/**
 * 三端协作 E2E 的两种目标：
 * - 本机拓扑（默认）：`scripts/browser-server.mjs` 托管三端产物（8306～8308）、起命令入口（`ADMIN_E2E_COMMANDS` 选 Node 或 Edge）
 *   并提供夹具（8309），连本机隔离 Supabase 栈；
 * - 已部署目标（`ADMIN_E2E_TARGET=deployed`，ADMIN-US-217 AC#5）：三端都打部署出的前端地址（`ADMIN_E2E_WEB_URLS`，按 React、
 *   Angular、Vue 的顺序以逗号分隔），不起 browser-server.mjs，只起 `scripts/deployed-fixtures.mjs`（夹具经部署栈的管理接口准备，
 *   端口 `ADMIN_E2E_FIXTURES_PORT`）。另有几个只在这个目标下的项目：`rls`（PostgREST 层的 RLS 矩阵，不用浏览器）、`otp-<端>`
 *   （真实发信的验证码登录与过期，需要 `ADMIN_E2E_MAIL_URL` 与 `ADMIN_E2E_OTP_EXPIRY_SECONDS`）与 `smoke-<端>`（回滚后的冒烟，
 *   需要 `ADMIN_E2E_SMOKE_*`）。
 * 用例经 `ADMIN_E2E_FIXTURES` 找到夹具服务，这里按目标设好，worker 进程继承。
 */
const deployed = process.env['ADMIN_E2E_TARGET'] === 'deployed';
const frameworks = ['react', 'angular', 'vue'];
/** 只在已部署目标下运行的用例文件。 */
const deployedOnly = /deployed-(rls|otp|smoke)\.spec\.ts$/;

function target(): Pick<PlaywrightTestConfig, 'webServer' | 'projects'> {
  if (!deployed) {
    process.env['ADMIN_E2E_FIXTURES'] = 'http://127.0.0.1:8309';
    return {
      webServer: {
        command: 'node scripts/browser-server.mjs',
        // 测试服务只打印就绪行（含命令入口的运行模式与地址，见 ADMIN_E2E_COMMANDS）与错误，进测试日志便于核对跑的是哪个入口
        stdout: 'pipe',
        url: 'http://127.0.0.1:8306',
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
        timeout: 90000
      },
      projects: frameworks.map((name, index) => ({
        name,
        testIgnore: deployedOnly,
        use: { baseURL: `http://127.0.0.1:${8306 + index}` }
      }))
    };
  }
  const urls = (process.env['ADMIN_E2E_WEB_URLS'] ?? '').split(',').filter(Boolean);
  const port = Number(process.env['ADMIN_E2E_FIXTURES_PORT']);
  if (urls.length !== frameworks.length || !Number.isInteger(port))
    throw new Error(
      'ADMIN_E2E_TARGET=deployed needs ADMIN_E2E_WEB_URLS (react,angular,vue) and ADMIN_E2E_FIXTURES_PORT'
    );
  process.env['ADMIN_E2E_FIXTURES'] = `http://127.0.0.1:${port}`;
  return {
    webServer: {
      command: 'node scripts/deployed-fixtures.mjs',
      stdout: 'pipe',
      url: `http://127.0.0.1:${port}/__ready`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
      timeout: 60000
    },
    projects: [
      ...frameworks.map((name, index) => ({ name, testIgnore: deployedOnly, use: { baseURL: urls[index] } })),
      { name: 'rls', testMatch: /deployed-rls\.spec\.ts$/, use: { baseURL: urls[0] } },
      ...frameworks.map((name, index) => ({
        name: `otp-${name}`,
        testMatch: /deployed-otp\.spec\.ts$/,
        use: { baseURL: urls[index] }
      })),
      ...frameworks.map((name, index) => ({
        name: `smoke-${name}`,
        testMatch: /deployed-smoke\.spec\.ts$/,
        use: { baseURL: urls[index] }
      }))
    ]
  };
}

const report = process.env['ADMIN_E2E_REPORT'];
export default defineConfig({
  testDir: './e2e',
  // 用例经 `@aiao/rxdb-plugin-working-tree/exchange` 形成平台交换记录（ADMIN-US-221）。这份 tsconfig 不带 tsconfig.base.json 的 paths：
  // 工作区包按包的 exports 解析到各自的 dist（与 Node 服务、Edge 产物一致），不把平台源码交给 Playwright 逐文件转译。
  tsconfig: './e2e/tsconfig.json',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  // 已部署目标另写 JSON 报告（`ADMIN_E2E_REPORT`），验收脚本据此把结果与发布 ID 一起记进证据
  reporter: report ? [['list'], ['json', { outputFile: report }]] : [['list']],
  ...target()
});
