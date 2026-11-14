import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: 'fixtures/dist',
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  cacheDir: '../../node_modules/.vite/packages/orbit',
  plugins: [
    dts({ entryRoot: 'src', pathsToAliases: false, tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json') })
  ],
  build: {
    outDir: 'dist',
    copyPublicDir: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        client: 'src/client.ts',
        window: 'src/window.ts',
        desktop: 'src/desktop.ts',
        react: 'src/react.ts',
        vue: 'src/vue.ts',
        angular: 'src/angular.ts'
      },
      formats: ['es'],
      fileName: (_, name) => name + '.js'
    },
    rolldownOptions: { external: ['react', 'vue', '@angular/core'], checks: { pluginTimings: false } }
  },
  test: {
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
          globalSetup: ['./fixtures/server.ts'],
          include: ['src/**/*.browser.spec.ts'],
          browser: {
            enabled: true,
            api: { host: '127.0.0.1' },
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/orbit',
      reporter: ['text', 'json', 'json-summary', 'lcovonly'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts']
    }
  }
});
