import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const host = '127.0.0.1';
const port = 8212;

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || `http://${host}:${port}`;

/**
 * 对 production build（vite preview）跑，与 dev-rxdb-react-e2e 同款理由：
 * dev server 的懒加载 chunk 间歇性失败；preview 每次起新进程 serve 本次产物
 * （`--strictPort` + `reuseExistingServer: false`，端口被孤儿进程占住时显式失败）。
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
  use: {
    baseURL,
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 20000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  reporter: [['html', { open: 'never' }]],
  webServer: {
    command: `node ../../node_modules/vite/bin/vite.js preview --port ${port} --strictPort --host ${host}`,
    url: baseURL,
    reuseExistingServer: false,
    cwd: join(workspaceRoot, 'apps/dev-rxdb-admin'),
    timeout: 180000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ]
});
