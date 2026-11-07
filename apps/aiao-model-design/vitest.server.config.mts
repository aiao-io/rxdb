import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: new URL('./server', import.meta.url).pathname,
  test: {
    name: 'aiao-model-design-server',
    environment: 'node',
    include: ['**/*.spec.ts'],
    clearMocks: true,
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../../coverage/apps/aiao-model-design-server',
      include: ['**/*.ts'],
      exclude: ['index.ts', '**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
