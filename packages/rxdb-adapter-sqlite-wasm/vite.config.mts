/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-sqlite-wasm',
  resolve: {
    alias: {
      '@aiao/rxdb-adapter-sqlite-core/testing': path.resolve(
        import.meta.dirname,
        '../rxdb-adapter-sqlite-core/src/testing.ts'
      )
    }
  },
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
          bundleName: 'rxdb-adapter-sqlite-wasm',
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
      entry: {
        index: 'src/index.ts',
        // package.json 的 `./testing` 子路径指向 dist/testing.js，入口漏了它就是死链
        testing: 'src/testing.ts'
      },
      name: '@aiao/rxdb-adapter-sqlite-wasm',
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
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
        '@subframe7536/sqlite-wasm',
        '@subframe7536/sqlite-wasm/idb',
        '@subframe7536/sqlite-wasm/idb-memory',
        '@subframe7536/sqlite-wasm/opfs',
        '@subframe7536/sqlite-wasm/fs-handle'
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
      '@subframe7536/sqlite-wasm',
      '@subframe7536/sqlite-wasm/idb',
      '@subframe7536/sqlite-wasm/idb-memory',
      '@subframe7536/sqlite-wasm/opfs',
      '@subframe7536/sqlite-wasm/fs-handle'
    ]
  },
  test: {
    name: 'rxdb-adapter-sqlite-wasm',
    watch: false,
    globals: true,
    testTimeout: process.env.CI ? 30000 : 5000,
    hookTimeout: process.env.CI ? 30000 : 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-sqlite-wasm/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-sqlite-wasm',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/__tests__/**', '**/dist/**']
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
