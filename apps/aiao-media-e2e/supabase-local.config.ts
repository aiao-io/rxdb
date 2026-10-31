import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: 'supabase-local.spec.mts',
  timeout: 60000,
  workers: 1,
  // Each run creates disposable accounts in the local Compose stack. Never reuse
  // a developer's server or upload its session traces to a remote Auth project.
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env['AIAO_PLAYWRIGHT_CHANNEL'] || 'chrome',
    baseURL: 'http://127.0.0.1:4399',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/supabase-local.mjs preview',
    url: 'http://127.0.0.1:4399',
    cwd: new URL('../aiao-media/', import.meta.url).pathname,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 120000
  }
});
