import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-media-api-test',
  resolve: {
    alias: {
      '@aiao-media/domain': resolve(import.meta.dirname, '../../packages/domain/src/index.ts')
    }
  },
  test: {
    name: 'aiao-media-api',
    watch: false,
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default']
  }
});
