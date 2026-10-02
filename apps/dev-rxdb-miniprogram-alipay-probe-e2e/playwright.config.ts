import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig } from '@playwright/test';

/**
 * 支付宝探针模拟器 e2e 的 Playwright 配置。
 *
 * 支付宝没有 miniprogram-automator 那样的自动化 SDK，这里经 CDP 直连开发者工具（Electron）：
 * 点「普通编译」让模拟器从磁盘重读 dist/，再到逻辑层求值读页面上的探针报告。Playwright 只当测试运行器用。
 *  - **没有 `webServer` / `baseURL` / `projects`**：没有浏览器页面。
 *  - **`workers: 1`**：开发者工具只有一个模拟器，探针目录也只有一个。
 *  - **`retries: 0`**：报告要么是新一轮的、要么超时，重试只会把「编译没生效」掩盖成绿。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 一轮探针在模拟器上实测 18–40 秒（配额计费实验要写几十 MiB），加上编译与轮询余量
  timeout: 180000,
  use: {
    trace: 'off'
  }
});
