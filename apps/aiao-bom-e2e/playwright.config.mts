import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:4314',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--enable-webgl', '--enable-unsafe-swiftshader'] }
  },
  webServer: [
    {
      command: 'node apps/aiao-bom/scripts/preview.mjs --root dist/apps/aiao-bom/browser --port 4314',
      url: 'http://localhost:4314',
      reuseExistingServer: false,
      cwd: workspaceRoot
    }
  ],
  projects: [
    { name: 'chromium', testIgnore: '**/domain/**', use: { ...devices['Desktop Chrome'] } },
    { name: 'domain', testDir: './src/domain', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      testMatch: '**/compatibility.spec.ts',
      use: { ...devices['Desktop Firefox'], launchOptions: {} }
    },
    { name: 'webkit', testMatch: '**/compatibility.spec.ts', use: { ...devices['Desktop Safari'], launchOptions: {} } }
  ]
});
