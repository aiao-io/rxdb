/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/angular',
  plugins: [angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcovonly', 'html'],
      reportsDirectory: '../../coverage/modules/angular'
    }
  }
});
