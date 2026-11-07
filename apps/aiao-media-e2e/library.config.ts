import { defineConfig } from '@playwright/test';
import base from './local-first.config';

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4407' },
  webServer: {
    command:
      'pnpm exec wrangler dev --config deploy/wrangler.json --local --port 4407 --show-interactive-dev-session false',
    url: 'http://127.0.0.1:4407',
    cwd: new URL('../aiao-media/', import.meta.url).pathname,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    timeout: 30000
  }
});
