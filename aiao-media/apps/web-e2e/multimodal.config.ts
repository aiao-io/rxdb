import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: 'multimodal-generation.spec.mts',
  outputDir: './test-output/playwright/multimodal',
  timeout: 120_000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env['AIAO_PLAYWRIGHT_CHANNEL'] || 'chrome',
    baseURL: 'http://127.0.0.1:4411',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command:
      'pnpm --dir apps/api exec wrangler dev --config wrangler.json --env local-first --env-file ../web-e2e/fixture.env --local --port 4411 --show-interactive-dev-session false',
    env: { CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' },
    url: 'http://127.0.0.1:4411',
    cwd: new URL('../../', import.meta.url).pathname,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 30_000
  }
});
