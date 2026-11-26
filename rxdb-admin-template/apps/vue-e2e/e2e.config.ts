import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
const isCI = Boolean(process.env['CI']);
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:8214';
/**
 * 全站都要登录：setup 项目先经登录页用模拟认证服务（`react-e2e/auth/e2e-auth-server.mjs`）登录并保存浏览器状态，
 * 其余用例的上下文从这份状态启动（自建的上下文同样带上 `ADMIN_E2E_AUTH_STATE`）。
 */
const authPort = 8216;
process.env['ADMIN_E2E_AUTH_STATE'] = join(
  workspaceRoot,
  'rxdb-admin-template/apps/vue-e2e/test-output/auth-state.json'
);
export default defineConfig({
  ...nxE2EPreset('.', { testDir: '../react-e2e/src' }),
  metadata: { storagePrefix: 'aiao.workbench.vue' },
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
  webServer: [
    {
      command: `node ../react-e2e/auth/e2e-auth-server.mjs --port ${authPort}`,
      cwd: join(workspaceRoot, 'rxdb-admin-template/apps/vue-e2e'),
      url: `http://127.0.0.1:${authPort}/collaboration-api/config`,
      reuseExistingServer: false,
      timeout: 30000
    },
    {
      command: 'node ../../../node_modules/vite/bin/vite.js preview --port 8214 --strictPort --host 127.0.0.1',
      cwd: join(workspaceRoot, 'rxdb-admin-template/apps/vue'),
      url: baseURL,
      reuseExistingServer: false,
      // vite preview 把 /collaboration-api 代理到模拟认证服务
      env: { ...(process.env as Record<string, string>), ADMIN_API_URL: `http://127.0.0.1:${authPort}` },
      timeout: 180000
    }
  ],
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], headless: true, storageState: process.env['ADMIN_E2E_AUTH_STATE'] }
    }
  ]
});
