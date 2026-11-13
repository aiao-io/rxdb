/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/aiao-media-admin-test',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: {
    alias: {
      '@aiao/rxdb-admin-angular': resolve(import.meta.dirname, '../../../packages/rxdb-admin-angular/src/index.ts'),
      '@aiao/rxdb-i18n-angular': resolve(import.meta.dirname, '../../../packages/rxdb-i18n-angular/src/index.ts')
    }
  },
  test: {
    name: 'aiao-media-admin',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    reporters: ['default']
  }
});
