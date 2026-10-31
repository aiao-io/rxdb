import angular from '@analogjs/vite-plugin-angular';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/aiao-media',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  test: {
    watch: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/aiao-media',
      reporter: ['text', 'json', 'json-summary', 'lcov']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'aiao-media-ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          include: ['src/app/**/*.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'aiao-media-data',
          globals: true,
          environment: 'happy-dom',
          include: ['src/contracts/**/*.spec.ts', 'src/local-data/**/*.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'aiao-media-browser',
          include: ['src/**/*.browser.test.ts'],
          testTimeout: 30000,
          hookTimeout: 30000,
          maxWorkers: 1,
          browser: {
            enabled: true,
            provider: playwright({ launchOptions: { channel: process.env['AIAO_PLAYWRIGHT_CHANNEL'] || 'chrome' } }),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  }
});
