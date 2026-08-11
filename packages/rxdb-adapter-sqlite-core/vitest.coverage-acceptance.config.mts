/// <reference types="vitest" />
/**
 * coverage-acceptance：用五个真实 consumer（本包 + 四个适配器）把本包 `src` 的覆盖率跑满。
 *
 * @remarks
 * 每个 suite 的运行环境必须与该包自己的 `vite.config.mts` 同口径（SQLC-038）。
 * 四个适配器包只有 chromium 一种模式，它们的 spec 直接用 `indexedDB` / `Worker` /
 * `window`，早先在这里被硬写成 `environment: 'node'`，稳定产出
 * `ReferenceError: indexedDB is not defined` 等 26 + 13 + 2 处失败 ——
 * 同一批用例在各自包的 `nx test` 里全绿。门禁因此永远跑不过，形同虚设。
 *
 * `core` 是例外：本包自身支持 `--browser.enabled=false` 的 node 模式，且 node 下
 * 还能多跑 `system-schema-migration.multiprocess.spec.ts`（浏览器模式里被排除），
 * 覆盖面是浏览器模式的超集，所以留在 node。
 *
 * @module
 */
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig, type ViteUserConfig } from 'vitest/config';
import { resolveAcceptanceRoot } from './vitest.acceptance-root.mjs';

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, '../..');
const acceptanceRoot = resolveAcceptanceRoot();
const suiteNames = ['core', 'wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai'] as const;

type SuiteName = (typeof suiteNames)[number];

const suiteRoots: Record<SuiteName, string> = {
  core: packageRoot,
  'wa-sqlite': path.join(workspaceRoot, 'packages/rxdb-adapter-wa-sqlite'),
  sqlite: path.join(workspaceRoot, 'packages/rxdb-adapter-sqlite'),
  'sqlite-wasm': path.join(workspaceRoot, 'packages/rxdb-adapter-sqlite-wasm'),
  sqliteai: path.join(workspaceRoot, 'packages/rxdb-adapter-sqliteai')
};

/**
 * 需要真实浏览器（chromium）的 suite。
 *
 * 判据不是「用了 IndexedDB」而是「该包的 vite.config 里 browser.enabled 为 true 且无 node 模式」。
 */
const browserSuites = new Set<SuiteName>(['wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai']);

/** 五个包 optimizeDeps.exclude 的公共部分（workspace 内部包 + 需保持 ESM 原样的运行时）。 */
const commonOptimizeExclude = [
  '@aiao/rxdb-test',
  '@aiao/rxdb-test/entities',
  '@aiao/rxdb-test/shop',
  '@aiao/rxdb',
  '@aiao/rxdb-adapter-sqlite-core',
  '@aiao/utils',
  'comlink',
  'rxjs'
];

/**
 * 各 suite 额外要排除预构建的 wasm / VFS 模块，逐条对应该包 vite.config 的 optimizeDeps.exclude。
 *
 * 预构建会把它们改写成 CJS interop 形态，wasm 与 Worker 入口随即取不到，
 * 因此这份清单必须与各包保持同步。
 */
const suiteOptimizeExclude: Record<SuiteName, string[]> = {
  core: [],
  'wa-sqlite': [
    '@sqlite.org/sqlite-wasm',
    'wa-sqlite',
    'wa-sqlite/dist/wa-sqlite-async.mjs',
    'wa-sqlite/dist/wa-sqlite.mjs',
    'wa-sqlite/src/examples/AccessHandlePoolVFS.js',
    'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
    'wa-sqlite/src/examples/IDBMirrorVFS.js',
    'wa-sqlite/src/examples/MemoryAsyncVFS.js',
    'wa-sqlite/src/examples/MemoryVFS.js',
    'wa-sqlite/src/examples/OPFSAdaptiveVFS.js',
    'wa-sqlite/src/examples/OPFSAnyContextVFS.js',
    'wa-sqlite/src/examples/OPFSCoopSyncVFS.js',
    'wa-sqlite/src/examples/OPFSWriteAheadVFS.js'
  ],
  sqlite: ['@sqlite.org/sqlite-wasm'],
  'sqlite-wasm': [
    '@subframe7536/sqlite-wasm',
    '@subframe7536/sqlite-wasm/idb',
    '@subframe7536/sqlite-wasm/idb-memory',
    '@subframe7536/sqlite-wasm/opfs',
    '@subframe7536/sqlite-wasm/fs-handle'
  ],
  sqliteai: ['@sqliteai/sqlite-wasm']
};

const coreSourceRoot = path.join(packageRoot, 'src');
const coreSourceInclude = path.join(coreSourceRoot, '**/*.ts');
const coreSourceExclude = [
  path.join(coreSourceRoot, '__tests__/**'),
  path.join(coreSourceRoot, '**/*.spec.ts'),
  path.join(coreSourceRoot, '**/*.test.ts'),
  path.join(coreSourceRoot, 'testing.ts'),
  path.join(coreSourceRoot, 'fts5/types.ts'),
  path.join(coreSourceRoot, 'oo1-types.ts')
];

const coreAliases = [
  {
    find: /^@aiao\/rxdb-adapter-sqlite-core\/testing$/,
    replacement: path.join(coreSourceRoot, 'testing.ts')
  },
  {
    find: /^@aiao\/rxdb-adapter-sqlite-core$/,
    replacement: path.join(coreSourceRoot, 'index.ts')
  },
  {
    // 指向 src 而不是 dist（SQLC-038）：dist 是压缩产物，类名被 mangle 成单字母，
    // 于是 `error.name`（取自 `constructor.name`）变成 `o` / `r`，
    // rxdb-test 的 `expectEncryptedError` 名称契约全线报错。
    // 各适配器包自己的 vite.config 靠 `tsconfigPaths: true` 走的也是 src，这里对齐它们。
    find: /^@aiao\/rxdb-adapter-encrypted$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb-adapter-encrypted/src/index.ts')
  },
  {
    find: /^@aiao\/rxdb-test\/entities$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb-test/dist/entities/index.js')
  },
  {
    find: /^@aiao\/rxdb-test\/shop$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb-test/dist/shop/index.js')
  },
  {
    find: /^@aiao\/rxdb-test\/system$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb-test/dist/system/index.js')
  },
  {
    find: /^@aiao\/rxdb-test$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb-test/dist/index.js')
  },
  {
    find: /^@aiao\/rxdb$/,
    replacement: path.join(workspaceRoot, 'packages/rxdb/dist/index.js')
  },
  {
    find: /^@aiao\/utils$/,
    replacement: path.join(workspaceRoot, 'packages/utils/dist/index.js')
  }
];

const isSuiteName = (value: string | undefined): value is SuiteName =>
  suiteNames.some(suiteName => suiteName === value);

const getProjectName = (suiteName: SuiteName): string => `sqlite-core-coverage-${suiteName}`;

const createResolveConfig = () => ({
  alias: coreAliases
});

/**
 * 浏览器 suite 需要的 dev server 配置。
 *
 * COOP/COEP 两个响应头是 OPFS / SharedArrayBuffer 的硬前置，缺了这两行
 * wa-sqlite 与 sqlite-wasm 的 OPFS 用例会在跨源隔离检查处直接失败。
 */
const createServerConfig = () => ({
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  },
  fs: {
    allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
  }
});

/**
 * suite 的运行环境。
 *
 * `screenshotFailures: false`：截图会落在 suite 所在包的目录里，
 * 那正是 runner 结束时断言必须保持洁净的 Git 工作区（SQLC-039）。
 */
const createEnvironmentConfig = (suiteName: SuiteName) =>
  browserSuites.has(suiteName) ?
    {
      browser: {
        enabled: true as const,
        provider: playwright(),
        headless: true,
        screenshotFailures: false,
        instances: [{ browser: 'chromium' }]
      }
    }
  : { environment: 'node' as const, browser: { enabled: false as const } };

const createMergeProject = (suiteName: SuiteName): ViteUserConfig => ({
  root: suiteRoots[suiteName],
  cacheDir: path.join(
    workspaceRoot,
    `node_modules/.vite/packages/rxdb-adapter-sqlite-core-coverage-${suiteName}-merge`
  ),
  resolve: createResolveConfig(),
  server: {
    fs: {
      allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
    }
  },
  test: {
    name: getProjectName(suiteName),
    globals: true,
    // 合并阶段只回放 blob，不执行任何用例：即便 blob 来自 chromium，
    // 这里也必须保持 browser 关闭，否则 merge 会白白拉起五个浏览器。
    environment: 'node',
    browser: {
      enabled: false
    }
  }
});

const createRunConfig = (suiteName: SuiteName): ViteUserConfig => ({
  root: suiteRoots[suiteName],
  cacheDir: path.join(workspaceRoot, `node_modules/.vite/packages/rxdb-adapter-sqlite-core-coverage-${suiteName}`),
  resolve: createResolveConfig(),
  server: createServerConfig(),
  optimizeDeps: {
    include: ['fastest-levenshtein', 'ms', 'uuid'],
    exclude: [...commonOptimizeExclude, ...suiteOptimizeExclude[suiteName]]
  },
  test: {
    name: getProjectName(suiteName),
    watch: false,
    globals: true,
    // 与各包 vite.config 同口径：sqlite / sqliteai 明确关掉文件级并行；
    // wa-sqlite 在这里进一步收到单 worker —— 五个 suite 是并发起的，
    // 五份 chromium 同时开满 worker 会把机器压垮。
    fileParallelism: !['wa-sqlite', 'sqlite', 'sqliteai'].includes(suiteName),
    maxWorkers: suiteName === 'wa-sqlite' ? 1 : undefined,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    include:
      suiteName === 'core' ?
        ['{src,tests,__tests__}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
      : ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    ...createEnvironmentConfig(suiteName),
    reporters: [
      'default',
      [
        'blob',
        {
          outputFile: path.join(acceptanceRoot, 'blobs', `${suiteName}.json`)
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
      reportsDirectory: path.join(acceptanceRoot, suiteName),
      include: [coreSourceInclude],
      exclude: coreSourceExclude
    }
  }
});

export default defineConfig(() => {
  const suiteName = process.env.SQLITE_CORE_COVERAGE_SUITE;
  if (isSuiteName(suiteName)) return createRunConfig(suiteName);
  if (suiteName !== undefined) throw new Error(`Unknown SQLite core coverage suite: ${suiteName}`);

  return {
    root: packageRoot,
    cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-adapter-sqlite-core-coverage-merge'),
    resolve: createResolveConfig(),
    server: {
      fs: {
        allow: [workspaceRoot, path.join(workspaceRoot, 'node_modules')]
      }
    },
    test: {
      projects: suiteNames.map(createMergeProject),
      watch: false,
      reporters: ['default'],
      coverage: {
        allowExternal: true,
        enabled: true,
        clean: true,
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary'],
        reportsDirectory: path.join(workspaceRoot, 'coverage/packages/rxdb-adapter-sqlite-core'),
        include: [coreSourceInclude],
        exclude: coreSourceExclude
      }
    }
  };
});
