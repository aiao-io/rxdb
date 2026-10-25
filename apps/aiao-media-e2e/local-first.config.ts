import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './src',
  testMatch: ['local-first.spec.ts', 'local-reliability.spec.ts', 'supabase-auth.spec.ts', 'library.spec.ts'],
  timeout: 60000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env['AIAO_PLAYWRIGHT_CHANNEL'] || 'chrome',
    baseURL: 'http://127.0.0.1:4398',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // The Nx test target prepares the build; keep the runtime in Playwright's process group for reliable shutdown.
    command:
      'pnpm exec wrangler dev --config deploy/wrangler.json --local --port 4398 --show-interactive-dev-session false',
    url: 'http://127.0.0.1:4398',
    cwd: new URL('../aiao-media/', import.meta.url).pathname,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 30000
  }
});
