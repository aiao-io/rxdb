import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-model-design-api',
  test: {
    name: 'aiao-model-design-api',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../../coverage/aiao-model-design/apps/api',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
