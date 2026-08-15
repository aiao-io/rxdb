/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-plugin-storage',
  plugins: [
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
          bundleName: 'rxdb-plugin-storage',
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
      entry: {
        index: 'src/index.ts',
        desktop: 'src/desktop.ts'
      },
      name: '@aiao/rxdb-plugin-storage',
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // desktop 入口经 host 协议说话，桌面适配器必须外置：内联会把它复制进浏览器主入口的依赖图
      external: ['@aiao/rxdb', '@aiao/rxdb-adapter-desktop', 'rxjs']
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
    exclude: [
      '@aiao/rxdb-test',
      '@aiao/rxdb-test/entities',
      '@aiao/rxdb',
      '@aiao/utils',
      '@aiao/rxdb-adapter-wa-sqlite',
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
    ],
    include: ['fastest-levenshtein', 'ms', 'uuid']
  },
  test: {
    name: 'rxdb-plugin-storage',
    watch: false,
    globals: true,
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
    reporters: ['default', 'junit'],
    // Node / browser 并行时不能共用 coverage 与 junit 产物（Vitest .tmp 会互相删除）。
    // coverage gate 只读 node 目录；browser 写到独立路径。
    outputFile: {
      junit:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-storage-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-storage/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-storage-browser'
        : '../../coverage/packages/rxdb-plugin-storage',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['**/dist/**', 'src/**/__tests__/**']
    }
  }
}));
