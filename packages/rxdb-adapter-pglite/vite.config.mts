/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { transform } from '@swc/core';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defaultClientConditions, defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export default defineConfig(() => {
  const workspaceRoot = path.resolve(import.meta.dirname, '../..');
  const coverageReportsDirectory = path.resolve(workspaceRoot, 'coverage/packages/rxdb-adapter-pglite');
  const rxdbTestRoot = path.resolve(workspaceRoot, 'packages/rxdb-test');
  const nodeTestMode = process.env.RXDB_PGLITE_NODE_TEST === 'true' || process.argv.includes('--browser.enabled=false');
  const testInclude =
    process.env.RXDB_PGLITE_TEST_FILE === undefined ?
      ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
    : [process.env.RXDB_PGLITE_TEST_FILE];
  const testExclude =
    nodeTestMode ?
      ['src/__tests__/system-schema-migration.browser.spec.ts']
    : ['src/__tests__/system-schema-migration.spec.ts'];

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-pglite',
    resolve: {
      tsconfigPaths: true,
      conditions: sourceConditions,
      alias: {
        '@aiao/rxdb-adapter-encrypted': path.resolve(workspaceRoot, 'packages/rxdb-adapter-encrypted/src/index.ts'),
        '@aiao/rxdb': path.resolve(workspaceRoot, 'packages/rxdb/src/index.ts'),
        '@aiao/utils': path.resolve(workspaceRoot, 'packages/utils/src/index.ts'),
        '@aiao/rxdb-test/encrypted': path.resolve(workspaceRoot, 'packages/rxdb-test/src/encrypted/index.ts'),
        '@aiao/rxdb-test/entities': path.resolve(workspaceRoot, 'packages/rxdb-test/entities/index.ts'),
        '@aiao/rxdb-test/graph': path.resolve(workspaceRoot, 'packages/rxdb-test/graph/index.ts'),
        '@aiao/rxdb-test/shop': path.resolve(workspaceRoot, 'packages/rxdb-test/shop/index.ts'),
        '@aiao/rxdb-test/system': path.resolve(workspaceRoot, 'packages/rxdb-test/system/index.ts'),
        '@aiao/rxdb-test/transaction': path.resolve(workspaceRoot, 'packages/rxdb-test/src/transaction/index.ts'),
        '@aiao/rxdb-test/tree-unique': path.resolve(workspaceRoot, 'packages/rxdb-test/src/tree-unique/index.ts'),
        // 兜底项必须排在所有子路径之后：alias 是前缀匹配，放前面会把
        // `@aiao/rxdb-test/transaction` 改写成 `.../src/index.ts/transaction`
        '@aiao/rxdb-test': path.resolve(workspaceRoot, 'packages/rxdb-test/src/index.ts')
      }
    },
    // PGlite 使用 WASM，需要排除优化避免打包问题
    optimizeDeps: {
      include: ['fastest-levenshtein', 'ms', 'uuid'],
      exclude: [
        '@aiao/rxdb-test',
        '@aiao/rxdb-test/entities',
        '@aiao/rxdb-test/shop',
        '@aiao/rxdb',
        '@aiao/utils',
        '@electric-sql/pglite',
        'rxjs'
      ]
    },
    // PGlite 需要 SharedArrayBuffer 支持（用于多线程 WASM）
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      },
      fs: {
        allow: [workspaceRoot, path.resolve(workspaceRoot, 'node_modules')]
      }
    },
    plugins: [
      {
        name: 'rxdb-test-legacy-decorators',
        enforce: 'pre',
        async transform(code, id) {
          if (!id.startsWith(rxdbTestRoot) || !id.endsWith('.ts')) return;

          return transform(code, {
            filename: id,
            sourceMaps: true,
            jsc: {
              parser: { syntax: 'typescript', decorators: true },
              transform: { legacyDecorator: true },
              target: 'es2022'
            },
            module: { type: 'es6' }
          });
        }
      },
      dts({
        entryRoot: 'src',
        aliasesExclude: [/^@aiao\//],
        pathsToAliases: false,
        tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
      }),
      // Codecov Bundle Analysis - 仅在 CI 环境中启用
      ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
        [
          codecovVitePlugin({
            enableBundleAnalysis: true,
            telemetry: false,
            bundleName: 'rxdb-adapter-pglite',
            uploadToken: process.env.CODECOV_TOKEN
          })
        ]
      : [])
    ],
    // 如果使用 workers，请取消下面的注释。
    // worker: {
    //  plugins: [ nxViteTsPaths() ],
    // },
    // 库构建配置。
    // See: https://vitejs.dev/guide/build.html#library-mode
    build: {
      outDir: './dist',
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: false,
      commonjsOptions: {
        transformMixedEsModules: true
      },
      lib: {
        // 也可以是字典或多个入口数组。
        entry: 'src/index.ts',
        name: '@aiao/rxdb-adapter-pglite',
        fileName: 'index',
        // 改成你需要支持的格式。
        // 别忘了同步更新 package.json。
        formats: ['es' as const]
      },
      rolldownOptions: {
        // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
        checks: { pluginTimings: false },
        // 不打进库里的外部依赖。
        external: [
          '@aiao/rxdb',
          '@aiao/rxdb-adapter-encrypted',
          '@aiao/utils',
          '@electric-sql/pglite',
          'rxjs',
          'object-hash',
          'type-fest'
        ]
      }
    },
    test: {
      name: 'rxdb-adapter-pglite',
      watch: false,
      globals: true,
      fileParallelism: false,
      maxWorkers: 1,
      browser:
        nodeTestMode ?
          { enabled: false }
        : {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            headless: true,
            screenshotFailures: false
          },
      passWithNoTests: true,
      typecheck: { enabled: true },
      restoreMocks: true,
      testTimeout: process.env.CI ? 120000 : 30000,
      hookTimeout: process.env.CI ? 120000 : 30000,
      teardownTimeout: process.env.CI ? 30000 : 10000,
      include: testInclude,
      exclude: testExclude,
      reporters: [
        'default',
        'junit',
        [path.resolve(workspaceRoot, 'scripts/coverage-atomic-reporter.mjs'), { outputDir: coverageReportsDirectory }]
      ],
      outputFile: {
        junit: '../../coverage/packages/rxdb-adapter-pglite/junit.xml'
      },
      coverage: {
        // 浏览器模式覆盖率需通过 `--coverage` 显式开启；默认开启会让本地全量套件不稳定，
        // 在写临时文件时可能失败。
        enabled: false,
        reportsDirectory: coverageReportsDirectory,
        provider: 'v8' as const,
        reporter: ['text', 'clover', 'lcovonly', 'html'],
        include: ['src/**/*.ts'],
        exclude: ['src/__tests__/**', 'src/**/*.spec.ts', 'src/**/*.test.ts', '**/dist/**']
      }
    }
  };
});
