/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// 本包有两趟 vitest：node 趟在真实 PGlite 上跑领域服务（建板 / 移动 / 排序 / 删除 / 详情），
// 浏览器趟在 sqlite-wasm（首轮宿主）上跑 FTS 搜索源与持久化相关用例。
// 对照 `packages/rxdb-plugin-search/vite.config.mts` 的同款开关。
const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-board',
  plugins: [
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    }),
    // Codecov Bundle Analysis - 仅在 CI 环境中启用
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-plugin-board',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: false,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      entry: 'src/index.ts',
      name: '@aiao/rxdb-plugin-board',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/rxdb', '@aiao/rxdb-plugin-search', '@aiao/utils', 'rxjs'],
      input: {
        index: 'src/index.ts',
        testing: 'src/testing/index.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: {
      allow: ['../../node_modules']
    }
  },
  optimizeDeps: {
    include: ['fastest-levenshtein', 'ms', 'uuid'],
    exclude: [
      '@aiao/rxdb',
      '@aiao/rxdb-adapter-pglite',
      '@aiao/rxdb-plugin-search',
      '@aiao/rxdb-test',
      '@aiao/utils',
      'comlink',
      'rxjs',
      'wa-sqlite',
      'wa-sqlite/dist/wa-sqlite-async.mjs',
      'wa-sqlite/dist/wa-sqlite.mjs',
      'wa-sqlite/src/examples/AccessHandlePoolVFS.js',
      'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
      'wa-sqlite/src/examples/MemoryAsyncVFS.js',
      'wa-sqlite/src/examples/MemoryVFS.js',
      'wa-sqlite/src/examples/OPFSAdaptiveVFS.js',
      'wa-sqlite/src/examples/OPFSAnyContextVFS.js',
      'wa-sqlite/src/examples/OPFSCoopSyncVFS.js',
      'wa-sqlite/src/examples/OPFSPermutedVFS.js'
    ]
  },
  test: {
    name: 'rxdb-plugin-board',
    watch: false,
    globals: true,
    fileParallelism: false,
    ...(isBrowserTest ?
      {
        include: ['{src,tests}/**/*.browser.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          screenshotFailures: false,
          instances: [
            {
              browser: 'chromium'
            }
          ]
        }
      }
    : {
        environment: 'node',
        include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['{src,tests}/**/*.browser.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
      }),
    reporters: ['default', 'junit'],
    // 两趟先各写各的中间产物，`test-browser` 收尾时再合并回覆盖率闸读的 node 目录。
    outputFile: {
      junit:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-board-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-board/junit.xml'
    },
    coverage: {
      enabled: false,
      reportsDirectory:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-board-browser'
        : '../../coverage/packages/rxdb-plugin-board',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.spec.*',
        'src/**/*.test.*',
        'src/**/*.d.ts',
        'src/testing/**',
        '**/dist/**'
      ],
      // 公开包门槛 80（核心四包是 90），见 scripts/audit/coverage-check.mjs。
      // node 趟覆盖领域服务主体；浏览器趟补 FTS 搜索源与持久化用例，只做补跑、不单独挂闸，
      // 合并后的总数由 `pnpm audit:coverage` 把关（与 rxdb-plugin-search 同款口径）。
      thresholds: isBrowserTest ?
        undefined
      : {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        }
    }
  }
}));
