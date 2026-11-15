import { workspaceRoot } from '@nx/devkit';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.mjs';

const remoteURL = process.env['BASE_URL'];
const localURL = 'http://127.0.0.1:4315';

export default defineConfig({
  ...baseConfig,
  testDir: './cloudflare',
  retries: 0,
  projects: [{ name: 'chromium' }],
  use: { ...baseConfig.use, baseURL: remoteURL || localURL },
  webServer:
    remoteURL ? undefined : (
      {
        command: 'pnpm --filter @aiao/aiao-bom-2 exec wrangler dev --config wrangler.json --ip 127.0.0.1 --port 4315',
        url: localURL,
        reuseExistingServer: false,
        cwd: workspaceRoot,
        timeout: 120000
      }
    )
});
