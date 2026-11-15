/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/aiao-media-admin-test',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: {
    alias: [
      { find: '@aiao/rxdb-admin-angular', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-admin-angular/src/index.ts') },
      { find: '@aiao/rxdb-i18n-angular', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-i18n-angular/src/index.ts') },
      { find: '@aiao/rxdb-model-angular', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-model-angular/src/index.ts') },
      { find: '@aiao/rxdb-model/headless', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-model/src/headless.ts') },
      { find: '@aiao/rxdb-model', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-model/src/index.ts') },
      { find: '@aiao/rxdb', replacement: resolve(import.meta.dirname, '../../../packages/rxdb/src/index.ts') },
      { find: '@aiao/rxdb-angular', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-angular/src/index.ts') },
      { find: '@aiao/rxdb-i18n', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-i18n/src/index.ts') },
      { find: '@aiao/rxdb-plugin-history', replacement: resolve(import.meta.dirname, '../../../packages/rxdb-plugin-history/src/index.ts') },
      { find: '@aiao/utils', replacement: resolve(import.meta.dirname, '../../../packages/utils/src/index.ts') }
    ]

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
