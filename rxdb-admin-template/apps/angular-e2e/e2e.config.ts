import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:8213';
/**
 * 全站都要登录：setup 项目先经登录页用模拟认证服务（`react-e2e/auth/e2e-auth-server.mjs`，Angular 的静态产物也由它托管）登录并保存浏览器状态，
 * 其余用例的上下文从这份状态启动（自建的上下文同样带上 `ADMIN_E2E_AUTH_STATE`）。
 */
process.env['ADMIN_E2E_AUTH_STATE'] = join(
  workspaceRoot,
  'rxdb-admin-template/apps/angular-e2e/test-output/auth-state.json'
);
export default defineConfig({
  ...nxE2EPreset('.', { testDir: '../react-e2e/src' }),
  metadata: { storagePrefix: 'aiao.workbench.angular' },
  fullyParallel: !isCI,
  workers: 2,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: { timeout: isCI ? 10000 : 5000 },
  use: {
    baseURL,
    locale: 'zh-CN',
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: 10000,
    navigationTimeout: 15000
  },
  reporter: [['html', { open: 'never' }]],
  webServer: {
    // 静态文件服务没法代理 /collaboration-api：由模拟认证服务同时托管 Angular 产物（找不到的页面回落到 index.html）
    command:
      'node rxdb-admin-template/apps/react-e2e/auth/e2e-auth-server.mjs --port 8213 --static dist/apps/rxdb-admin-template-angular/browser',
    cwd: workspaceRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180000
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], headless: true, storageState: process.env['ADMIN_E2E_AUTH_STATE'] }
    }
  ]
});
