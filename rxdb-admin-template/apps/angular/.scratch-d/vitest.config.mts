import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname + '/..',
  cacheDir: '../../../node_modules/.vite/apps/rxdb-admin-template-angular-scratch-d',
  test: {
    name: 'scratch-d-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.scratch.ts'],
    reporters: ['default']
  }
});
