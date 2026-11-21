import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.integration.spec.ts'], testTimeout: 20000, fileParallelism: false }
});
