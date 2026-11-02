/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/browser-workbench-angular',
  plugins: [angular({ jit: true, tsconfig: path.join(import.meta.dirname, 'tsconfig.spec.json') })],
  resolve: { tsconfigPaths: true, conditions: ['@aiao/source'], dedupe: ['@angular/core'] },
  test: {
    name: 'browser-workbench-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/browser-workbench-angular',
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcovonly'],
      include: ['src/**/*']
    }
  }
});
