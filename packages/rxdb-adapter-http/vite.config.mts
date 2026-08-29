/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  envDir: resolve(import.meta.dirname, '../../'),
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-http',
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
          bundleName: 'rxdb-adapter-http',
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
      name: '@aiao/rxdb-adapter-http',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/rxdb', 'rxjs']
    }
  },
  test: {
    name: 'rxdb-adapter-http',
    watch: false,
    globals: true,
    // 本包**必须**跑在 node 环境（US-212 AC#13）：
    // node/undici 的 fetch 失败消息是 `fetch failed`，一条都不命中 core 的
    // `FETCH_FAILURE_MESSAGE` 正则。只在浏览器消息上断言的用例会让这条契约漏测。
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-http/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-http',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['**/__tests__/**', '**/tests/**', '**/dist/**']
    }
  }
}));
