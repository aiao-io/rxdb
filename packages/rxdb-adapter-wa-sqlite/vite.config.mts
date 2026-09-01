/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const waSqliteVfsModules = [
  'wa-sqlite/src/examples/AccessHandlePoolVFS.js',
  'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
  'wa-sqlite/src/examples/IDBMirrorVFS.js',
  'wa-sqlite/src/examples/MemoryAsyncVFS.js',
  'wa-sqlite/src/examples/MemoryVFS.js',
  'wa-sqlite/src/examples/OPFSAdaptiveVFS.js',
  'wa-sqlite/src/examples/OPFSAnyContextVFS.js',
  'wa-sqlite/src/examples/OPFSCoopSyncVFS.js',
  'wa-sqlite/src/examples/OPFSWriteAheadVFS.js'
] as const;

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-wa-sqlite',
  resolve: {
    tsconfigPaths: true
  },
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
          bundleName: 'rxdb-adapter-wa-sqlite',
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
      entry: {
        index: 'src/index.ts',
        client: 'src/WaSqliteClientBase.ts',
        // package.json 的 `./testing` 子路径指向 dist/testing.js，入口漏了它就是死链
        testing: 'src/testing.ts'
      },
      name: '@aiao/rxdb-adapter-wa-sqlite',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/utils',
        'comlink',
        'rxjs',
        '@sqlite.org/sqlite-wasm',
        'wa-sqlite',
        'wa-sqlite/dist/wa-sqlite-async.mjs',
        'wa-sqlite/dist/wa-sqlite.mjs',
        ...waSqliteVfsModules
      ]
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
      '@aiao/rxdb-test',
      '@aiao/rxdb-test/entities',
      '@aiao/rxdb-test/shop',
      '@aiao/rxdb',
      '@aiao/rxdb-adapter-sqlite-core',
      '@aiao/utils',
      'comlink',
      'rxjs',
      '@sqlite.org/sqlite-wasm',
      'wa-sqlite',
      'wa-sqlite/dist/wa-sqlite-async.mjs',
      'wa-sqlite/dist/wa-sqlite.mjs',
      ...waSqliteVfsModules
    ]
  },
  test: {
    name: 'rxdb-adapter-wa-sqlite',
    alias: [
      {
        find: '@aiao/rxdb-adapter-sqlite-core/testing',
        replacement: path.resolve(import.meta.dirname, '../rxdb-adapter-sqlite-core/src/testing.ts')
      },
      {
        find: '@aiao/rxdb-adapter-sqlite-core',
        replacement: path.resolve(import.meta.dirname, '../rxdb-adapter-sqlite-core/src/index.ts')
      }
    ],
    watch: false,
    globals: true,
    // 文件级并行安全：各 spec 独立 OPFS/DB。CI 下限并发防 OOM / CPU 抖动；本地放宽。
    maxWorkers: process.env.CI ? 3 : 4,
    testTimeout: process.env.CI ? 120000 : 30000,
    hookTimeout: process.env.CI ? 120000 : 30000,
    teardownTimeout: process.env.CI ? 30000 : 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-wa-sqlite/junit.xml'
    },
    coverage: {
      enabled: false,
      reportOnFailure: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-wa-sqlite',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.ts', 'src/**/*.d.ts', '**/dist/**']
    },
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
}));
