import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4303';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  /* 并行执行所有测试 */
  fullyParallel: !isCI,
  /* 增加 workers */
  workers: isCI ? 2 : 8,
  /* 本地不重试 */
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    serviceWorkers: 'block',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  /*
   * 不覆盖 preset 的 reporter：`...nxE2EPreset(...)` 已给出带
   * `outputFolder: 'test-output/playwright/report'` 的 html reporter，
   * 并在 CI 追加 blob reporter（分片合并报告要靠它）。
   * 整体覆盖会同时丢掉 blob 并把 html 写到 `test-output/` 之外。
   */
  /* Run your local dev server before starting the tests
   *
   * reuseExistingServer 永远关掉：本地模式启着 reuse=true 时，源码改了再 build 不会
   * 替换跑着的 preview server，测试继续吃旧 bundle，触发 search 用例的 UNIQUE
   * constraint + first-render 预算 race（实测在 8 workers 下稳定复现）。代价
   * 是每次 e2e 多花 5-10s build，但拿到确定性。dist 由 e2e target 的
   * dependsOn(dev-rxdb-vue:build) 保证是最新的。
   *
   * 直接 exec vite（而非 `nx run …:preview`）：nx/pnpm 包装链会把真正监听端口的
   * vite 进程 spawn 成脱离进程组的孙子进程，Playwright teardown 只杀得掉包装层，
   * vite 被 reparent 到 init 继续占用 4303，导致下一次 e2e 报 “port 4303 already
   * used”。直接 node 起 vite 让它留在 Playwright 的进程组里，teardown 能回收。
   */
  webServer: {
    command: 'node ../../node_modules/vite/bin/vite.js preview --port 4303 --strictPort',
    url: 'http://localhost:4303',
    reuseExistingServer: false,
    cwd: join(workspaceRoot, 'apps/dev-rxdb-vue'),
    timeout: isCI ? 180000 : 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] }
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] }
    // }

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ]
});
