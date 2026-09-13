/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-miniprogram',
  resolve: {
    tsconfigPaths: true
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
          bundleName: 'rxdb-adapter-miniprogram',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      entry: {
        index: 'src/index.ts',
        runtime: 'src/runtime.ts'
      },
      name: '@aiao/rxdb-adapter-miniprogram',
      formats: ['es' as const]
    },
    rolldownOptions: {
      checks: { pluginTimings: false },
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/rxdb-adapter-wa-sqlite',
        '@aiao/rxdb-adapter-wa-sqlite/client',
        'wa-sqlite',
        // Emscripten glue 必须保持外部依赖：它内部有 `new URL('wa-sqlite.wasm', import.meta.url)`，
        // 一旦打进 dist，vite 就把它当资产引用，把 727 KB 的 wasm 以 base64 内联进产物
        // （dist 凭空多出约 1 MB 死代码，小程序主包直接超限）。留在外部则由宿主应用自行
        // 定位 wasm —— adapter 本来就显式传 `locateFile`，那条分支永远走不到。
        /^@subframe7536\/sqlite-wasm(\/|$)/
      ]
    }
  },
  test: {
    name: 'rxdb-adapter-miniprogram',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/rxdb-adapter-miniprogram',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'lcovonly', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.ts', 'src/**/*.d.ts']
    }
  }
}));
