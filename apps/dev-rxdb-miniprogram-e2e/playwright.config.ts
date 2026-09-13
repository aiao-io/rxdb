import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env['CI']);

/**
 * 微信小程序 e2e 的 Playwright 配置。
 *
 * 这里只把 Playwright 当**测试运行器**用（reporter / timeout / retry / 并发控制），
 * 被测对象由 `miniprogram-automator` 通过 WebSocket 驱动微信开发者工具，
 * 全程不存在浏览器。与 `dev-rxdb-electron-e2e` 同源的三处刻意差异：
 *  - **没有 `webServer`**：小程序没有 HTTP 服务，产物是 `apps/dev-rxdb-miniprogram/dist/`，
 *    由开发者工具自己加载。
 *  - **没有 `use.baseURL` 与 `projects`**：没有浏览器，浏览器项目矩阵不适用。
 *  - **`workers: 1`**：一个开发者工具实例只能跑一个小程序，且 wa-sqlite 落盘在
 *    `wx.env.USER_DATA_PATH` 这个单一目录里，并发会互相踩。
 *
 * `fullyParallel: false` 之外还有一层约束：`launch-persistence.spec.ts` 依赖
 * **同一文件内**的用例顺序（先写探针、重启、再读回），Playwright 单 worker 下
 * 同文件用例按声明顺序执行，这是它成立的前提。
 *
 * `retries` 沿用 preset 的 `CI ? 2 : 0`，理由与 angular-e2e 里那段长注释一致：
 * 本地重试会把 flaky 掩盖成绿。同样**不要**把它改成无条件的 2。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  // 冷启动要拉起开发者工具、编译 Taro 产物、初始化 wa-sqlite WASM，比浏览器用例慢一个量级。
  timeout: 180000,
  expect: {
    timeout: 15000
  },
  use: {
    trace: 'off'
  }
});
