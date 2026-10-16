import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] || 'http://localhost:4311';
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: 120000,
  expect: { timeout: isCI ? 10000 : 8000 },
  use: {
    baseURL,
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  // 直接静态服务产物（先例同 dev-rxdb-angular-e2e：webServer 不带 buildTarget）
  webServer: {
    command: 'node scripts/e2e-static-server.mjs --root dist/apps/dev-rxdb-bom/browser --port 4311',
    url: 'http://localhost:4311',
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: isCI ? 180000 : 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ]
});
