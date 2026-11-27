/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

const INTEGRATION_TESTS = ['src/**/__tests__/integration/**/*.spec.ts'];

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true
  },
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-model-design-web',
  plugins: [angular({ tsconfig: path.join(import.meta.dirname, 'tsconfig.spec.json') })],
  test: {
    name: 'aiao-model-design-web',
    server: { deps: { inline: [/@antv\/x6/] } },
    watch: false,
    globals: true,
    passWithNoTests: true,
    pool: 'forks',
    maxWorkers: 2,
    execArgv: ['--no-experimental-webstorage'],
    isolate: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ['default', 'junit'],
    outputFile: { junit: '../../../coverage/aiao-model-design/apps/web/junit.xml' },
    coverage: {
      enabled: true,
      reportsDirectory: '../../../coverage/aiao-model-design/apps/web',
      provider: 'v8' as const,
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      include: ['src/**/*.ts'],
      exclude: ['**/index.ts', '**/public-api.ts', '**/dist/**', '**/*.spec.ts', '**/test-setup.ts', '**/__tests__/**']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'rxdb-model-designer',
          environment: 'happy-dom',
          include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          exclude: [...configDefaults.exclude, ...INTEGRATION_TESTS],
          setupFiles: ['src/app/model-designer/__tests__/test-setup.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'rxdb-model-designer-integration',
          environment: 'node',
          include: INTEGRATION_TESTS
        }
      }
    ]
  },
  define: { 'import.meta.vitest': mode !== 'production' }
}));
