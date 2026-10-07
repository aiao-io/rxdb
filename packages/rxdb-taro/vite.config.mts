/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-taro',
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
          bundleName: 'rxdb-taro',
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
    lib: {
      entry: {
        index: 'src/index.ts',
        vite: 'src/vite.ts',
        runtime: 'src/runtime.ts'
      },
      name: '@aiao/rxdb-taro',
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // `.` 与 `./vite` 跑在 Taro CLI 的 Node 进程里：node: 内建必须外置，否则会被换成空的浏览器 stub，构建照样成功、运行才炸。
      // `./runtime` 跑在小程序逻辑层，adapter 由 app 自己的构建打进去，宿主工厂要与 adapter 主入口是同一份
      external: [/^node:/, /^@aiao\/rxdb-adapter-miniprogram/]
    }
  },
  test: {
    name: 'rxdb-taro',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-taro/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-taro',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/**/__tests__/**']
    }
  }
}));
