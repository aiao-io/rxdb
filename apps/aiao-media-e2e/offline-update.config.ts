import { defineConfig } from '@playwright/test';
import base from './local-first.config';
export default defineConfig({
  ...base,
  testMatch: 'offline-update.spec.ts',
  timeout: 90000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4397' },
  webServer: {
    command: 'node scripts/offline-update-server.mjs',
    url: 'http://127.0.0.1:4397',
    cwd: new URL('../aiao-media/', import.meta.url).pathname,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }
  }
});
