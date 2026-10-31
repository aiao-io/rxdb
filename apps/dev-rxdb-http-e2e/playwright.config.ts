import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, APP_BASE_URL, APP_PORT, E2E_DATABASE } from './src/env';

const isCI = Boolean(process.env['CI']);

/**
 * 后端启动命令。
 *
 * @remarks
 * `reset seed serve` 三步一体：`reset` 删掉 pglite 数据目录重建空库，`seed` 写 250 行确定性种子，
 * `serve` 才起服务。每次 e2e 都从同一份逐字节相同的 250 行开始——用例才敢断言
 * 「第 3 页第 1 行是 X」，而不是退化成「大概有几条」。
 */
const apiCommand = [
  `RXDB_HTTP_DEMO_PORT=${API_PORT}`,
  `RXDB_HTTP_DEMO_DB=${E2E_DATABASE}`,
  // `__control/*` 只在非 production 注册，而整套 AC#9～#15 都靠它切状态。
  'NODE_ENV=test',
  'node apps/dev-rxdb-http-server/src/main.ts reset seed serve'
].join(' ');

export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  /*
   * 串行。用例之间共享同一个后端进程，而它们要切的是**进程级**状态
   * （离线开关、注入错误码、`Access-Control-Expose-Headers`、翻页形态）。
   * 并行跑就是让两个用例同时改一台机器的全局开关，失败与真实原因无关。
   */
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  /*
   * 必须显式设置：`nxE2EPreset` 不设 `timeout`，Playwright 默认 30000ms，
   * 而单个用例要走完「冷启动 OPFS → 一次 metadata → 若干次 by-ids」整条链。
   */
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  use: {
    baseURL: APP_BASE_URL,
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  /* reporter 沿用 preset：它已经配好 html（test-output/playwright/report）与 CI 的 blob。 */

  /*
   * 两个 webServer：后端 + 前端产物。
   *
   * 前端直接运行仓库的 SPA 静态服务，复用外层 build 产物，避免在 Playwright
   * 子进程里嵌套 Nx 构建及遗留静态服务。`e2e` target 已声明前后端构建依赖。
   *
   * `reuseExistingServer: false`：@nx/web 的 file-server 在端口被占时会 `detectPort`
   * **静默换端口**，复用又会把上一轮残留的进程（serve 的是旧产物）当成本次的服务器。
   */
  webServer: [
    {
      command: apiCommand,
      url: `http://127.0.0.1:${API_PORT}/v1/meta/version`,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: isCI ? 120000 : 60000
    },
    {
      command: `node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-http/browser --port ${APP_PORT}`,
      url: APP_BASE_URL,
      reuseExistingServer: false,
      cwd: workspaceRoot,
      timeout: isCI ? 180000 : 120000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ]
});
