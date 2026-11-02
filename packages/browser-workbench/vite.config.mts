/// <reference types='vitest' />
import path from 'node:path';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  cacheDir: '../../node_modules/.vite/packages/browser-workbench',
  plugins: [dts({ entryRoot: 'src', tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json') })],
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: { entry: { index: 'src/index.ts', 'rxdb-catalog': 'src/rxdb-catalog.ts' }, formats: ['es'] },
    rolldownOptions: { external: [/^@aiao\/rxdb(?:\/|$)/, /^rxjs(?:\/|$)/], checks: { pluginTimings: false } }
  },
  test: {
    name: 'browser-workbench',
    watch: false,
    globals: true,
    environment: 'node',
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true
        }
      }
    },
    include: ['src/**/*.spec.ts'],
    coverage: {
      reportsDirectory: '../../coverage/packages/browser-workbench',
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcovonly'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts']
    }
  }
});
