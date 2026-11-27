import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const isCI = Boolean(process.env['CI']);
const port = Number(process.env['MODEL_DESIGN_E2E_PORT'] ?? 4420);
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${port}`;
const staticServer = join(workspaceRoot, 'scripts/e2e-static-server.mjs');
const staticRoot = join(workspaceRoot, 'dist/aiao-model-design/apps/web/browser');

export default defineConfig({
  ...nxE2EPreset('.', { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: isCI ? 60000 : 30000,
  expect: {
    timeout: isCI ? 10000 : 5000
  },
  use: {
    baseURL,
    locale: 'zh-CN',
    trace: { mode: 'retain-on-failure', screenshots: false },
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000
  },
  webServer: {
    command: `${process.execPath} ${staticServer} --root ${staticRoot} --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    cwd: workspaceRoot,
    timeout: 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], headless: true }
    }
  ]
});
