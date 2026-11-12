import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env['DESKTOP_TEST_OUTPUT'] ?? '../../test-output/web-desktop',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  maxFailures: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4300', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm nx run web-desktop:preview',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 60000
  }
});
