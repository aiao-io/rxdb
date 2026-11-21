import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-model-design-model-ops',
  test: {
    name: 'aiao-model-design-model-ops',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../../coverage/aiao-model-design/packages/model-ops',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts', 'src/testing.ts', 'src/fixtures.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
