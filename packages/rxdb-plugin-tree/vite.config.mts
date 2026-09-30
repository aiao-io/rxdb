/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// 本包有两趟 vitest：浏览器趟跑运行时（查询/合并/仓储），node 趟跑构建期生成器
// （`src/generator/**` 要真实 `tsc` 与 node fs，浏览器里跑不了）。
// 对照 `packages/rxdb-plugin-search/vite.config.mts` 的同款开关。
const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-tree',
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
          bundleName: 'rxdb-plugin-tree',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  // 如果使用 workers，请取消下面的注释。
  // worker: {
  //  plugins: [],
  // },
  // 库构建配置。
  // See: https://vite.dev/guide/build.html#library-mode
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
      name: '@aiao/rxdb-plugin-tree',
      fileName: 'index',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/rxdb', '@aiao/rxdb-client-generator', 'rxjs'],
      input: {
        index: 'src/index.ts',
        generator: 'src/generator/index.ts'
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
    // 排除包（@aiao/rxdb / @aiao/utils）的 CJS 深层依赖需显式预优化，
    // 否则测试运行中途发现新依赖会触发 reload，打断测试文件的动态 import
    include: ['fastest-levenshtein', 'ms', 'uuid'],
    exclude: [
      '@aiao/rxdb-test',
      '@aiao/rxdb-test/entities',
      '@aiao/rxdb',
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
    name: 'rxdb-plugin-tree',
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
            // {
            //   browser: 'firefox'
            // }
            // 让全部测试通过还需要一些额外工作
            // {
            //   browser: 'webkit'
            // }
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
          '../../coverage/packages/rxdb-plugin-tree-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-tree/junit.xml'
    },
    coverage: {
      enabled: false,
      reportsDirectory:
        isBrowserTest ? '../../coverage/packages/rxdb-plugin-tree-browser' : '../../coverage/packages/rxdb-plugin-tree',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      // 两趟的 include 互斥：构建期生成器只有 node 趟碰得到，运行时只有浏览器趟碰得到。
      // 不切开的话任一趟都会把对面的文件算成 0 覆盖，门槛必然挂。
      include: isBrowserTest ? ['src/**/*'] : ['src/generator/**/*'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.spec.*',
        'src/**/*.test.*',
        'src/**/*.d.ts',
        '**/dist/**',
        ...(isBrowserTest ? ['src/generator/**'] : [])
      ],
      // 公开包门槛 80（核心四包是 90），见 scripts/audit/coverage-check.mjs。
      // 与 rxdb-plugin-search 不同，这里**两趟都挂**：那边 browser 趟只是补跑几个用例、
      // 够不着门槛，本包两趟的 include 互斥，各自都是自己那块的全量覆盖率。
      // 合并后的总数由 `pnpm audit:coverage` 把关，这两份是 RXD-043 要的
      // 「让 Nx target 自己变红」的本地闸。
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
}));
