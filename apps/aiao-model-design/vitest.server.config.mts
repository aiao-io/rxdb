import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: new URL('./server', import.meta.url).pathname,
  resolve: { tsconfigPaths: true },
  test: {
    name: 'aiao-model-design-server',
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'edge/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../../coverage/apps/aiao-model-design-server',
      include: ['src/**/*.ts', 'edge/**/*.ts'],
      exclude: ['src/index.ts', '**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
