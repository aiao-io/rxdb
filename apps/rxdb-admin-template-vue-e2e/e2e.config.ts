import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
const isCI = Boolean(process.env['CI']);
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:8214';
export default defineConfig({
  ...nxE2EPreset('.', { testDir: '../rxdb-admin-template-react-e2e/src' }),
  metadata: { storagePrefix: 'aiao.workbench.vue' },
  fullyParallel: !isCI,
  workers: 2,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 120000 : 90000,
  expect: { timeout: isCI ? 10000 : 5000 },
  use: {
    baseURL,
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: 10000,
    navigationTimeout: 15000
  },
  reporter: [['html', { open: 'never' }]],
  webServer: {
    command: 'node ../../node_modules/vite/bin/vite.js preview --port 8214 --strictPort --host 127.0.0.1',
    cwd: join(workspaceRoot, 'apps/rxdb-admin-template-vue'),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } }]
});
