/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import * as path from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// RRE-009：真实 RxDB / Repository 与 React 的 layout-passive 提交时序只在真浏览器里成立，
// 由 `nx test-browser rxdb-react` 通过该环境变量驱动（见 project.json）。
const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-react',
  resolve: {
    tsconfigPaths: true
  },
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    }),
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-react',
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
      name: '@aiao/rxdb-react',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: ['react', 'react-dom', 'react/jsx-runtime', '@aiao/rxdb', '@aiao/utils', 'rxjs']
    }
  },
  // wa-sqlite 只在浏览器 project 里用到（RRE-009 的真实 RxDB 夹具）：
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
      'rxjs',
      'ms',
      'fastest-levenshtein',
      'ts-xor',
      '@aiao/rxdb',
      '@aiao/rxdb-adapter-wa-sqlite',
      '@aiao/utils',
      'comlink',
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
    name: 'rxdb-react',
    watch: false,
    globals: true,
    testTimeout: isBrowserTest ? 30000 : 2000,
    hookTimeout: isBrowserTest ? 30000 : 2000,
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
        environment: 'happy-dom',
        include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['{src,tests}/**/*.browser.{test,spec}.{ts,tsx}']
      }),
    reporters: ['default'],
    coverage: {
      // Node / browser 两个 project 并行时不能共用 coverage 产物（Vitest 的 .tmp 会互相删除）
      reportsDirectory:
        isBrowserTest ? '../../coverage/packages/rxdb-react-browser' : '../../coverage/packages/rxdb-react',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'json', 'lcovonly', 'html']
    }
  }
}));
