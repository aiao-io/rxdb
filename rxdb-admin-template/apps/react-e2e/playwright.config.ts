import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const host = '127.0.0.1';
const port = 8212;
/**
 * 全站都要登录：setup 项目先经登录页用模拟认证服务（`react-e2e/auth/e2e-auth-server.mjs`）登录并保存浏览器状态，
 * 其余用例的上下文从这份状态启动（自建的上下文同样带上 `ADMIN_E2E_AUTH_STATE`）。
 */
const authPort = 8215;
process.env['ADMIN_E2E_AUTH_STATE'] = join(
  workspaceRoot,
  'rxdb-admin-template/apps/react-e2e/test-output/auth-state.json'
);

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || `http://${host}:${port}`;

/**
 * 对 production build（vite preview）跑，与 dev-rxdb-react-e2e 同款理由：
 * dev server 的懒加载 chunk 间歇性失败；preview 每次起新进程 serve 本次产物
 * （`--strictPort` + `reuseExistingServer: false`，端口被孤儿进程占住时显式失败）。
 */
export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src' }),
  metadata: { storagePrefix: 'aiao.workbench' },
  fullyParallel: !isCI,
  workers: isCI ? 2 : 8,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  use: {
    baseURL,
    locale: 'zh-CN',
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  reporter: [['html', { open: 'never' }]],
  webServer: [
    {
      command: `node auth/e2e-auth-server.mjs --port ${authPort}`,
      url: `http://${host}:${authPort}/collaboration-api/config`,
      reuseExistingServer: false,
      cwd: join(workspaceRoot, 'rxdb-admin-template/apps/react-e2e'),
      timeout: 30000
    },
    {
      command: `node ../../../node_modules/vite/bin/vite.js preview --port ${port} --strictPort --host ${host}`,
      url: baseURL,
      reuseExistingServer: false,
      cwd: join(workspaceRoot, 'rxdb-admin-template/apps/react'),
      // vite preview 把 /collaboration-api 代理到模拟认证服务
      env: { ...(process.env as Record<string, string>), ADMIN_API_URL: `http://${host}:${authPort}` },
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
