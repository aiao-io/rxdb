/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/angular-todo',
  plugins: [angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'angular-todo',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts', 'todo-page/**/*.{test,spec}.ts', 'todo-cursor-page/**/*.{test,spec}.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      enabled: true,
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'lcovonly', 'html'],
      reportsDirectory: '../../coverage/modules/angular-todo',
      include: ['src/**/*.ts', 'todo-page/**/*.ts', 'todo-cursor-page/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/index.ts', 'src/test-setup.ts']
    }
  }
});
