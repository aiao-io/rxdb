/// <reference types="vitest" />
/**
 * coverage acceptance 的第二段：跑 PGlite 适配器侧消费 `src/encrypted`、`src/transaction`
 * 与 `src/tree-unique` 共享套件的 contract spec。
 *
 * @remarks
 * 这三组套件是本包**发布给适配器执行**的产品面，本包自己的 unit run 一行都跑不到，
 * 留在分母里就是永远填不满的死代码（RXT-030）。选 PGlite 而不是 wa-sqlite / sqlite-wasm，
 * 是因为它在 `browser.enabled: false` 下能整套跑起来（内存 store，无需 playwright）：
 * wa-sqlite 侧的 crud / change-log spec 走 `IDBBatchAtomicVFS`，依赖 `indexedDB` 与
 * `navigator.locks`，在 Node 里必炸；PGlite 的同名 spec 逐条对应同一批套件入口。
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveAcceptanceRoot } from './vitest.acceptance-root.mjs';

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, '../..');
const adapterRoot = path.resolve(packageRoot, '../rxdb-adapter-pglite');
const acceptanceRoot = resolveAcceptanceRoot();

export default defineConfig({
  root: adapterRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-pglite'),
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
      // 必须走源码：dist 产物会把 `EncryptedQueryError` 之类的类名压成 `o`，
      // 而 `error-contract.ts` 是按 `name` 断言的，指向 dist 会整片假红。
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
  optimizeDeps: {
    exclude: [
      '@aiao/rxdb-test/encrypted',
      '@aiao/rxdb-test/transaction',
      '@aiao/rxdb-test/tree-unique',
      '@electric-sql/pglite'
    ]
  },
  test: {
    name: 'rxdb-test-coverage-pglite',
    watch: false,
    globals: true,
    restoreMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    browser: {
      enabled: false
    },
    // 一条套件进分母，就必须有一条对应的 consumer spec 在这个列表里，否则分母被稀释。
    // 这份清单要与 `scripts/run-coverage-acceptance.mjs` 的 `suiteFiles` 保持同步。
    include: [
      'src/__tests__/encrypted-crud.spec.ts',
      'src/__tests__/encrypted-lifecycle.spec.ts',
      'src/__tests__/encrypted-tamper.spec.ts',
      'src/__tests__/encrypted-change-log.spec.ts',
      'src/__tests__/encrypted-bigint-binary.spec.ts',
      'src/__tests__/transaction-contract.spec.ts',
      'src/__tests__/tree-unique-contract.spec.ts'
    ],
    reporters: [
      'default',
      [
        'blob',
        {
          outputFile: path.join(acceptanceRoot, 'blobs/pglite.json')
        }
      ]
    ],
    coverage: {
      allowExternal: true,
      enabled: true,
      clean: true,
      provider: 'v8',
      reporter: ['text-summary'],
      reportOnFailure: true,
      reportsDirectory: path.join(acceptanceRoot, 'pglite'),
      include: [
        path.join(packageRoot, 'src/encrypted/**/*.ts'),
        path.join(packageRoot, 'src/transaction/**/*.ts'),
        path.join(packageRoot, 'src/tree-unique/**/*.ts'),
        path.join(packageRoot, 'entities/**/*.ts'),
        path.join(packageRoot, 'shop/**/*.ts')
      ],
      exclude: [path.join(packageRoot, 'src/**/*.spec.ts'), path.join(packageRoot, 'src/**/*.test.ts')]
    }
  }
});
