import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const host = '127.0.0.1';
const port = 8211;

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || `http://${host}:${port}`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src' }),
  fullyParallel: !isCI,
  workers: isCI ? 2 : 8,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  reporter: [['html', { open: 'never' }]],
  /*
   * Serve the production build in every environment, matching dev-rxdb-angular-e2e
   * (serve-static) and dev-rxdb-vue-e2e (preview).
   *
   * Running the Vite dev server locally made the suite flaky: it intermittently
   * failed to serve a lazy route chunk, so the app rendered the router error screen
   * ("Failed to fetch dynamically imported module") and every assertion on that page
   * failed. Nx flagged the task as flaky. Using the dev server locally also meant
   * local and CI exercised different artifacts, so a green local run said little
   * about CI. `preview` dependsOn `build`, which the e2e target depends on anyway,
   * so this adds no work that was not already being done.
   */
  /*
   * P1-2：`reuseExistingServer: !isCI` + `nx run ...:preview` 的组合有一个真实的失效模式：
   * nx 的 preview 是 continuous target，它的 vite 进程经常在本次运行结束后存活下来
   * （被 reparent 到 init）。下次跑 e2e 时端口还占着，于是 Playwright **直接复用那个旧进程** ——
   * 而它 serve 的是**上一次 build 的产物**。测试于是在旧 bundle 上跑，
   * 结果与「本次 build 是否正确」完全脱钩。
   *
   * 这不是理论风险：本轮收口 P0-2 时就撞上了 —— 同一段用例先失败（34 次重试全是旧状态），
   * 隔了几次运行后原样通过，差别只在于期间有没有重新 build。
   *
   * 改为直接 exec vite preview + `--strictPort` + `reuseExistingServer: false`，
   * 与 `dev-rxdb-vue-e2e` 的做法对齐：
   * - `--strictPort` 让端口被占时**立刻报错**，而不是悄悄换端口或复用旧进程；
   * - `reuseExistingServer: false` 保证每次都起新进程、serve 本次产物。
   *
   * 端口被孤儿进程占住时会报 "Port 8211 is already in use" 而不是静默跑旧产物 ——
   * 这正是想要的：**一个显式失败，好过一次说明不了任何事的绿。**
   */
  webServer: {
    command: `node ../../node_modules/vite/bin/vite.js preview --port ${port} --strictPort --host ${host}`,
    url: baseURL,
    reuseExistingServer: false,
    cwd: join(workspaceRoot, 'apps/dev-rxdb-react'),
    timeout: 180000
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
