/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-sqliteai',
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
          bundleName: 'rxdb-adapter-sqliteai',
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
      name: '@aiao/rxdb-adapter-sqliteai',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/utils',
        'comlink',
        'rxjs',
        '@sqliteai/sqlite-wasm'
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
      '@sqliteai/sqlite-wasm'
    ]
  },
  test: {
    name: 'rxdb-adapter-sqliteai',
    watch: false,
    globals: true,
    fileParallelism: false,
    testTimeout: process.env.CI ? 30000 : 10000,
    hookTimeout: process.env.CI ? 30000 : 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-sqliteai/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-sqliteai',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', '**/dist/**']
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
