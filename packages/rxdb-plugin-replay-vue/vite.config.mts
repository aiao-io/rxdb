/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  cacheDir: './node_modules/.vite',
  ...(mode === 'test' ?
    {
      resolve: {
        alias: {
          vue: path.resolve(import.meta.dirname, '../../node_modules/vue')
        },
        dedupe: ['vue']
      }
    }
  : {}),
  plugins: [
    vue(),
    dts({
      aliasesExclude: [/^@aiao\//],
      compilerOptions: { composite: false },
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
          bundleName: 'rxdb-plugin-replay-vue',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
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
      entry: 'src/index.ts',
      name: '@aiao/rxdb-plugin-replay-vue',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['vue', /^@aiao\//]
    }
  },
  test: {
    name: 'rxdb-plugin-replay-vue',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-plugin-replay-vue/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-replay-vue',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
