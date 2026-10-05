import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';

/**
 * 支付宝探针模拟器 e2e 的 Playwright 配置。
 *
 * 支付宝没有 miniprogram-automator 那样的自动化 SDK，这里经 CDP 直连开发者工具（Electron）：
 * 停掉再启动编译（工具栏开关）让模拟器从磁盘重读 dist/，再到逻辑层求值读页面上的探针报告。Playwright 只当测试运行器用。
 *  - **没有 `webServer` / `baseURL` / `projects`**：没有浏览器页面。
 *  - **`workers: 1`**：开发者工具只有一个模拟器，探针目录也只有一个。
 *  - **`retries: 0`**：报告要么是新一轮的、要么超时，重试只会把「编译没生效」掩盖成绿。
 *  - 有断言红了，Playwright 会换新 worker 给剩下的用例重跑 `beforeAll`，也就是再跑一轮探针；单轮上限要按整轮算。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 核心实验跑通后一轮探针实测约 122 秒（配额计费与 SQLite 配额实验各写几十 MiB），加上编译与轮询余量
  timeout: 300000,
  use: {
    trace: 'off'
  }
});
