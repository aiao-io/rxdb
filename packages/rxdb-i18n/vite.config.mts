/// <reference types="vitest" />
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-i18n',
  plugins: [
    {
      name: 'legacy-decorators',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.ts') || !code.includes('@Entity')) return;
        return transformWithEsbuild(code, id, {
          loader: 'ts',
          tsconfigRaw: { compilerOptions: { experimentalDecorators: true } }
        });
      }
    },
    dts({ entryRoot: 'src', pathsToAliases: false, tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json') })
  ],
  build: {
    outDir: 'dist',
    lib: {
      entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`
    },
    rolldownOptions: { external: ['@aiao/rxdb', 'rxjs', 'intl-messageformat'], checks: { pluginTimings: false } }
  },
  test: {
    name: 'rxdb-i18n',
    ...(isBrowserTest ?
      {
        include: ['src/runtime-smoke.browser.spec.ts'],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          screenshotFailures: false,
          instances: [{ browser: 'chromium' }]
        }
      }
    : { environment: 'node', include: ['src/**/*.spec.ts'], exclude: ['src/**/*.browser.spec.ts'] }),
    globals: true,
    watch: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/rxdb-i18n',
      reporter: ['text', 'json-summary', 'json', 'lcovonly'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
