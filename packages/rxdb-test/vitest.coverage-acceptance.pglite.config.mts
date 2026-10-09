/// <reference types="vitest" />
/**
 * coverage acceptance 的第二段：跑 PGlite 适配器侧消费 `src/encrypted`、`src/transaction`、
 * `src/tree-unique` 与 `src/sortable` 共享套件的 contract spec。
 *
 * @remarks
 * 这四组套件是本包**发布给适配器执行**的产品面，本包自己的 unit run 一行都跑不到，
 * 留在分母里就是永远填不满的死代码（RXT-030）。选 PGlite 而不是 wa-sqlite / sqlite-wasm，
 * 是因为它在 `browser.enabled: false` 下能整套跑起来（内存 store，无需 playwright）：
 * wa-sqlite 侧的 crud / change-log spec 走 `IDBBatchAtomicVFS`，依赖 `indexedDB` 与
 * `navigator.locks`，在 Node 里必炸；PGlite 的同名 spec 逐条对应同一批套件入口。
 *
 * 本配置是双 project 结构：
 * - runner（root = `rxdb-adapter-pglite`）：真正执行测试的 project，`src/__tests__/*.spec.ts`
 *   是 PGlite 包自己的 consumer spec，所以 root 必须留在那里；
 * - coverage-root helper（root = `rxdb-test`）：不跑任何测试（`include: []`），存在的唯一
 *   理由是 vitest 给「本段没加载、但进了 coverage.include 的文件」补 0 覆盖时，只会挑
 *   `root` 是该文件路径前缀的 project 转译（@vitest/coverage-v8 的
 *   `createUncoveredFileTransformer`）。runner 的 root 是 pglite 包，`entities/`、`shop/`
 *   这些文件谁都匹配不上，就会退回把 TS 原文当 JS 解析，每次刷 24 条
 *   `Failed to parse … Excluding it from coverage` 噪音（roadmap 零散收尾项第 16 条）。
 *   补上这个 project 后，它们走与 unit 段同口径的 rxdb-test 管线正常转译。
 *
 *   分母与最终报告仍由 merge 段决定（`vitest.coverage-acceptance.merge.config.mts`），
 *   helper 只影响本段的中间 text-summary；blob 由全局 reporter 统一落一份，
 *   空 project 在 blob 里只占一个名字，merge 段按名字回放时自动忽略它。
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveAcceptanceRoot } from './vitest.acceptance-root.mjs';

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, '../..');
const adapterRoot = path.resolve(packageRoot, '../rxdb-adapter-pglite');
const acceptanceRoot = resolveAcceptanceRoot();

/** runner 与 helper 共用的 resolve；每次调用返回新对象，两个 project 的 config 不得共享引用。 */
const createResolveConfig = () => ({
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
      find: /^@aiao\/rxdb-test\/sortable$/,
      replacement: path.join(packageRoot, 'src/sortable/index.ts')
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
});

export default defineConfig({
  root: adapterRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-pglite'),
  test: {
    projects: [
      {
        root: adapterRoot,
        cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-pglite-runner'),
        resolve: createResolveConfig(),
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
            '@aiao/rxdb-test/sortable',
            '@electric-sql/pglite'
          ]
        },
        test: {
          name: 'rxdb-test-coverage-pglite',
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
          // 套件本身不进分母（`*.suite.ts` 已被 coverage.exclude 排掉），但套件驱动的
          // `src/encrypted` / `src/transaction` / `src/tree-unique` / `src/sortable` 产品代码进。少一条 consumer spec，
          // 对应那片产品代码就只剩本包 unit run 跑不到的死代码，整体覆盖率被稀释（RXT-030）。
          include: [
            'src/__tests__/encrypted-crud.spec.ts',
            'src/__tests__/encrypted-lifecycle.spec.ts',
            'src/__tests__/encrypted-tamper.spec.ts',
            'src/__tests__/encrypted-change-log.spec.ts',
            'src/__tests__/encrypted-bigint-binary.spec.ts',
            'src/__tests__/transaction-contract.spec.ts',
            'src/__tests__/tree-unique-contract.spec.ts',
            'src/__tests__/manual-order-contract.spec.ts'
          ]
        }
      },
      {
        // coverage-root helper：见文件头注释。root = rxdb-test 才能接住本段
        // coverage.include 里那些本段测试没加载的文件（entities/、shop/ 等）。
        root: packageRoot,
        cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-pglite-root'),
        resolve: createResolveConfig(),
        server: {
          fs: {
            allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
          }
        },
        test: {
          name: 'rxdb-test-coverage-pglite-root',
          include: [],
          environment: 'node',
          browser: {
            enabled: false
          }
        }
      }
    ],
    watch: false,
    passWithNoTests: true,
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
        path.join(packageRoot, 'src/sortable/**/*.ts'),
        path.join(packageRoot, 'entities/**/*.ts'),
        path.join(packageRoot, 'shop/**/*.ts')
      ],
      // *.suite.ts 是共享测试套件（describe/it 工厂），与 *.spec.ts 同属测试代码，不进分母。
      exclude: [
        path.join(packageRoot, 'src/**/*.spec.ts'),
        path.join(packageRoot, 'src/**/*.test.ts'),
        path.join(packageRoot, 'src/**/*.suite.ts')
      ]
    }
  }
});
