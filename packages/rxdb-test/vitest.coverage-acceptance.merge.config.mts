/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, '../..');
const pgliteRoot = path.resolve(packageRoot, '../rxdb-adapter-pglite');

export default defineConfig({
  root: packageRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-merge'),
  resolve: {
    conditions: ['@aiao/source'],
    tsconfigPaths: true
  },
  server: {
    fs: {
      allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
    }
  },
  test: {
    projects: [
      {
        root: packageRoot,
        cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-unit-merge'),
        resolve: {
          conditions: ['@aiao/source'],
          tsconfigPaths: true
        },
        test: {
          name: 'rxdb-test-coverage-unit',
          globals: true,
          environment: 'happy-dom',
          browser: {
            enabled: false
          }
        }
      },
      {
        root: pgliteRoot,
        cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-pglite-merge'),
        resolve: {
          alias: [
            {
              find: /^@aiao\/rxdb-test\/encrypted$/,
              replacement: path.join(packageRoot, 'src/encrypted/index.ts')
            },
            {
              find: /^@aiao\/rxdb-test\/transaction$/,
              replacement: path.join(packageRoot, 'src/transaction/index.ts')
            },
            {
              find: /^@aiao\/rxdb-test\/tree-unique$/,
              replacement: path.join(packageRoot, 'src/tree-unique/index.ts')
            },
            {
              find: /^@aiao\/rxdb-test\/entities$/,
              replacement: path.join(packageRoot, 'entities/index.ts')
            },
            {
              find: /^@aiao\/rxdb-test\/shop$/,
              replacement: path.join(packageRoot, 'shop/index.ts')
            },
            {
              find: /^@aiao\/rxdb-adapter-encrypted$/,
              replacement: path.join(workspaceRoot, 'packages/rxdb-adapter-encrypted/src/index.ts')
            },
            {
              find: /^@aiao\/rxdb$/,
              replacement: path.join(workspaceRoot, 'packages/rxdb/src/index.ts')
            },
            {
              find: /^@aiao\/utils$/,
              replacement: path.join(workspaceRoot, 'packages/utils/src/index.ts')
            }
          ],
          conditions: ['@aiao/source'],
          tsconfigPaths: true
        },
        server: {
          fs: {
            allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
          }
        },
        test: {
          name: 'rxdb-test-coverage-pglite',
          globals: true,
          environment: 'node',
          browser: {
            enabled: false
          }
        }
      }
    ],
    watch: false,
    reporters: ['default'],
    coverage: {
      enabled: true,
      clean: true,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: path.join(workspaceRoot, 'coverage/packages/rxdb-test'),
      // 这份 include 才是最终报告的分母（两段 blob 合并后按它过滤）。
      // `entities` / `shop` 是发布出去的共享模型，必须与 `src` 同等进分母（RXT-030）。
      include: ['src/**/*.ts', 'entities/**/*.ts', 'shop/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts']
    }
  }
});
