/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-electron-test',
  test: {
    name: 'dev-rxdb-electron',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src-electron/**/*.spec.ts'],
    reporters: ['default']
  }
});
