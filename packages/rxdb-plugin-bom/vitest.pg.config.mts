import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-bom-pg',
  test: {
    name: 'rxdb-plugin-bom-pg',
    environment: 'node',
    include: ['tests-pg/**/*.spec.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 15000,
    watch: false,
    coverage: { enabled: false }
  }
});
