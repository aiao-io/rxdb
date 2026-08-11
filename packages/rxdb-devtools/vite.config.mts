/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: './node_modules/.cache/vite',
  // 生产代码只从 @aiao/rxdb 取 type-only 导入（编译期擦除），但契约测试需要在运行时
  // 真的 new 一个 RxDB。开着 tsconfigPaths 才能让 vitest 解析到 workspace 源码。
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
          bundleName: 'rxdb-devtools',
          telemetry: false,
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
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // 也可以是字典或多个入口数组。
      entry: 'src/index.ts',
      name: '@aiao/rxdb-devtools',
      fileName: 'index',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: []
    }
  },
  test: {
    name: 'rxdb-devtools',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './node_modules/.cache/test-results/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: './node_modules/.cache/coverage',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'lcovonly', 'html'],
      include: ['src/**/*'],
      // spec 文件被默认 exclude 挡掉了，`__tests__/fixtures/` 下的测试夹具不是 spec，
      // 会以「未覆盖的生产代码」身份混进统计 —— 夹具里没被某条用例走到的分支
      // 不是生产缺口，混进来只会稀释真实数字。
      exclude: ['src/**/__tests__/fixtures/**']
    }
  }
}));
