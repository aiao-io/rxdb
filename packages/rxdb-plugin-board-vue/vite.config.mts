/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import vue from '@vitejs/plugin-vue';
import * as path from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-board-vue',
  plugins: [
    vue(),
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
          bundleName: 'rxdb-plugin-board-vue',
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
      entry: 'src/index.ts',
      name: 'rxdb-plugin-board-vue',
      fileName: 'index',
      // 样式资产入口是 `./board-view.css` 子路径（与 React / Angular 绑定同名），lib 默认会命名为 index.css
      cssFileName: 'board-view',
      formats: ['es' as const]
    },
    rolldownOptions: {
      checks: { pluginTimings: false },
      external: [/^@aiao\//, 'vue', 'rxjs']
    }
  },
  test: {
    name: 'rxdb-plugin-board-vue',
    watch: false,
    globals: true,
    testTimeout: 15000,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-board-vue',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
