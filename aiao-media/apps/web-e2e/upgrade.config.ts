import { defineConfig } from '@playwright/test';
import base from './local-first.config';

export default defineConfig({
  ...base,
  testMatch: 'upgrade.spec.ts',
  use: { ...base.use, serviceWorkers: 'block' }
});
