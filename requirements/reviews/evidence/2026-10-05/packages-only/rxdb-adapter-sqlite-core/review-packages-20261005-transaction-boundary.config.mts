import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: '/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core',
  cacheDir: '/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core/probe-cache',
  resolve: { tsconfigPaths: true },
  test: {
    include: ['/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core/review-packages-20261005-transaction-boundary.spec.ts'],
    watch: false,
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    browser: { enabled: false },
    coverage: { enabled: false },
    reporters: ['default', 'json'],
    outputFile: { json: '/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/packages-only/rxdb-adapter-sqlite-core/review-packages-20261005-transaction-boundary.report.json' }
  }
});
