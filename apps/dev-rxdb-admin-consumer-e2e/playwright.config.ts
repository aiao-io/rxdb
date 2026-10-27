import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const host = '127.0.0.1';
const port = 8213;

const baseURL = process.env['BASE_URL'] || `http://${host}:${port}`;

/**
 * 对 production build（vite preview）跑，与 dev-rxdb-react-e2e 同款理由。
 * 消费示例用固定库名（无 e2e 库名机制），隔离靠 Playwright 每测试新 context
 * 的全新 IndexedDB；同一测试内的 reload 保留数据以验证刷新持久化。
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
    cwd: join(workspaceRoot, 'apps/dev-rxdb-admin-consumer'),
    timeout: 180000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ]
});
