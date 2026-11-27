/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-bom',
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
          bundleName: 'rxdb-plugin-bom',
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
      name: '@aiao/rxdb-plugin-bom',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      checks: { pluginTimings: false },
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/rxdb-adapter-wa-sqlite',
        '@aiao/rxdb-adapter-pglite',
        'rxjs'
      ],
      input: {
        index: 'src/index.ts',
        'testing/index': 'src/testing/index.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
    }
  },
  resolve: {
    // PGlite 0.5.10 顶层守卫式 `await import("node:module")`（node 环境才执行）：
    // browser 测试转换链会静态解析到它（esbuild 系硬报错）；指向空模块即可——
    // 守卫分支在浏览器永不执行
    alias: { 'node:module': path.join(import.meta.dirname, 'src/__tests__/node-module-shim.js') }
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
    include: ['fastest-levenshtein', 'ms', 'uuid', '@electric-sql/pglite', '@electric-sql/pglite/contrib/btree_gist'],
    exclude: [
      '@aiao/rxdb-test',
      '@aiao/rxdb-test/entities',
      '@aiao/rxdb',
      '@aiao/utils',
      '@aiao/rxdb-adapter-wa-sqlite',
      '@aiao/rxdb-adapter-pglite',
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
    name: 'rxdb-plugin-bom',
    watch: false,
    globals: true,
    fileParallelism: false,
    include: ['{src,tests,tests-reach}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-plugin-bom/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-bom',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.*', 'src/**/*.test.*', 'src/**/*.d.ts']
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
      ]
    }
  }
}));
