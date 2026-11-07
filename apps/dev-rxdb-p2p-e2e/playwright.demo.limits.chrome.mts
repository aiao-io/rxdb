import { defineConfig } from '@playwright/test';
import demoConfig from './playwright.demo.config.ts';

const webServer = demoConfig.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error('demo webServer must be configured once');

export default defineConfig({
  ...demoConfig,
  testIgnore: [],
  testMatch: '**/governance-limits.spec.ts',
  webServer: {
    ...webServer,
    env: {
      ...webServer.env,
      POOL_POLICY_OVERRIDES: JSON.stringify({ 'signal-hello': { windowMs: 60_000, maxCount: 3 } })
    }
  }
});
