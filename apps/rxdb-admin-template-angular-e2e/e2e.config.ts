import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);
const baseURL = process.env['BASE_URL'] || 'http://127.0.0.1:8213';
export default defineConfig({
  ...nxE2EPreset('.', { testDir: '../rxdb-admin-template-react-e2e/src' }),
  metadata: { storagePrefix: 'aiao.workbench.angular' },
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
    command: 'pnpm --config.verifyDepsBeforeRun=false nx run rxdb-admin-template-angular:serve-e2e --skipRemoteCache',
    cwd: workspaceRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } }]
});
