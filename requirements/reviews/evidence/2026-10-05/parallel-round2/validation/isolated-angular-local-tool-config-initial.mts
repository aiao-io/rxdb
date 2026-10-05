import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: import.meta.dirname,
  plugins: [angular({ jit: true, tsconfig: import.meta.dirname + '/tsconfig.json' })],
  test: {
    name: 'isolated-rxdb-plugin-search-angular',
    environment: 'happy-dom',
    include: ['rxdb-plugin-search-angular.spec.ts'],
    setupFiles: ['./angular-setup.ts'],
    watch: false,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 15000,
    reporters: ['default', 'junit'],
    outputFile: { junit: 'rxdb-plugin-search-angular.junit.xml' }
  }
});
