import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/**
 * ELEC-10：Electron 打包 smoke 的 Playwright 配置。
 *
 * 与 `dev-rxdb-angular-e2e` 有三处刻意的差异：
 *  - **没有 `webServer`**：被测对象是 `electron-builder --dir` 产出的真实产物，
 *    由 `_electron.launch()` 直接拉起，不经任何 HTTP 服务。走 dev server 就验不到
 *    `file:` 协议下的 CSP / 路由 / WASM —— 而那恰恰是 ELEC-09 与 ELEC-10 的全部内容。
 *  - **没有 `use.baseURL` 与 `projects`**：Electron 自带 Chromium，浏览器项目矩阵不适用。
 *  - **`workers: 1`**：每个 worker 都会拉起一个独立的 Electron 主进程，而它们共用同一份
 *    userData 目录（SQLite/OPFS 落盘位置），并发会互相踩。
 *
 * `retries` 沿用 preset 的 `CI ? 2 : 0`，理由与 angular-e2e 里那段长注释一致：
 * 本地重试会把 flaky 掩盖成绿。同样**不要**把它改成无条件的 2。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  // 冷启动要解 asar、初始化 wa-sqlite WASM，比浏览器用例慢。
  timeout: 120000,
  expect: {
    timeout: isCI ? 15000 : 10000
  },
  use: {
    trace: 'on-first-retry'
  }
});
