import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: [['list']],
  webServer: {
    command: 'node scripts/browser-server.mjs',
    url: 'http://127.0.0.1:8306',
    reuseExistingServer: false,
    timeout: 90000
  },
  projects: ['react', 'angular', 'vue'].map((name, index) => ({
    name,
    use: { baseURL: `http://127.0.0.1:${8306 + index}` }
  }))
});
