/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// RWS-009：真实 IndexedDB / BroadcastChannel / Entity Proxy 只在真浏览器里存在，
// 由 `nx test-browser rxdb-plugin-workspace` 通过该环境变量驱动（见 project.json）。
const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: './node_modules/.cache/vite',
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
          bundleName: 'rxdb-plugin-workspace',
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
      name: '@aiao/rxdb-plugin-workspace',
      fileName: 'index',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/rxdb', 'rxjs', 'idb-keyval']
    }
  },
  // wa-sqlite 只在浏览器 project 里用到（RWS-009 的真实 RxDB 夹具）：
  // 它的 wasm 与 VFS 必须绕开 vite 预打包，且要 COOP/COEP 才能拿到 SharedArrayBuffer。
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
      '@aiao/rxdb-adapter-wa-sqlite',
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
    name: 'rxdb-plugin-workspace',
    watch: false,
    globals: true,
    testTimeout: isBrowserTest ? 30000 : 5000,
    ...(isBrowserTest ?
      {
        include: ['{src,tests}/**/*.browser.{test,spec}.{ts,tsx}'],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          screenshotFailures: false,
          instances: [{ browser: 'chromium' }]
        }
      }
    : {
        environment: 'node',
        include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['{src,tests}/**/*.browser.{test,spec}.{ts,tsx}']
      }),
    reporters: ['default', 'junit'],
    // Node / browser 两个 project 并行时不能共用 coverage 与 junit 产物
    // （Vitest 的 .tmp 会互相删除）。coverage gate 只读 node 目录，browser 写独立路径。
    outputFile: {
      junit:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-workspace-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-workspace/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-workspace-browser'
        : '../../coverage/packages/rxdb-plugin-workspace',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/**/*.spec.ts', '**/dist/**']
    }
  }
}));
