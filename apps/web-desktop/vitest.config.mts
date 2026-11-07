import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'web-desktop',
    watch: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.browser.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.spec.ts'],
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] }
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/web-desktop',
      reporter: ['text', 'json-summary', 'lcovonly'],
      include: [
        'src/core/**/*.ts',
        'src/host/windows.ts',
        'src/host/recovery.ts',
        'src/host/permission-labels.ts',
        'src/samples/document.ts'
      ],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 }
    }
  }
});
