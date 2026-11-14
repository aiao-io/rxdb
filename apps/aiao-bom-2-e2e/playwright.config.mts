import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
process.env['BOM_OVERVIEW_PATH'] = '/domain';
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false, workers: 1, retries: 0, timeout: 120000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://localhost:4314', trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--enable-webgl', '--enable-unsafe-swiftshader'] } },
  webServer: [{ command: 'node apps/aiao-bom-2/scripts/preview.mjs --root dist/apps/aiao-bom-2/browser --port 4314', url: 'http://localhost:4314', reuseExistingServer: false, cwd: workspaceRoot }, { command: 'node apps/aiao-bom-2/scripts/preview.mjs --root dist/apps/aiao-bom/browser --port 4316', url: 'http://localhost:4316', reuseExistingServer: false, cwd: workspaceRoot }],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'domain', testDir: '../aiao-bom-e2e/src', use: { ...devices['Desktop Chrome'] } }, { name: 'firefox', testMatch: '**/compatibility.spec.ts', use: { ...devices['Desktop Firefox'], launchOptions: {} } }, { name: 'webkit', testMatch: '**/compatibility.spec.ts', use: { ...devices['Desktop Safari'], launchOptions: {} } }]
});
