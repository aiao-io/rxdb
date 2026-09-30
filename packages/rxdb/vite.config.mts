/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb',
  plugins: [
    dts({
      entryRoot: 'src',
      aliasesExclude: [/^@aiao\//],
      compilerOptions: {
        baseUrl: import.meta.dirname,
        paths: {
          '@aiao/rxdb': ['./src/index.ts'],
          '@aiao/utils': ['../utils/src/index.ts']
        }
      },
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    }),
    // Codecov Bundle Analysis - 仅在 CI 环境中启用
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  resolve: {
    alias: {
      '@aiao/rxdb': path.resolve(import.meta.dirname, 'src/index.ts')
    }
  },
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
      // 多入口：`./testing` 是独立子路径导出，必须单独成产物。
      // 它承载 `merge_*` 系列共用的查询任务测试台，会 `import 'vitest'`——
      // 并进主入口等于让运行时入口背上测试框架。
      // package.json 的 `./testing` 指向 dist/testing.js，
      // 漏登记这一条就是死链（scripts/audit/subpath-build-entries.mjs 守这条）。
      entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
      name: '@aiao/rxdb',
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。`vitest` 必须在其中：`./testing` 子路径的测试台用 `vi` 造
      // RxDB 替身，打进产物等于把整个测试框架塞进发布包；它是**可选** peer，
      // 只有装了 vitest 的消费者才会走到 `./testing` 这条子路径。
      external: ['@aiao/utils', 'rxjs', 'type-fest', 'uuid', 'vitest']
    }
  },
  test: {
    name: 'rxdb',
    watch: false,
    globals: true,
    testTimeout: 5000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    outputFile: {
      junit: '../../coverage/packages/rxdb/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb',
      // istanbul provider 支持多 browser instances（v8 仅支持单实例）；
      // 多浏览器矩阵下统一用 istanbul
      provider: 'istanbul' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      // `src/testing/**` 与 `src/__tests__/**` 同类：都是测试代码，不是被测面。
      // 区别只在它经 `./testing` 子路径发布出去，给 `@aiao/rxdb-plugin-tree` 这类
      // 自带 merge 的插件包复用。计进来量的不是核心覆盖率，而是「测试台的每个分支
      // 在本包内被走到没有」——本包用不到的分支（插件的计数任务）永远为否。
      exclude: ['src/__tests__/**', 'src/testing.ts', 'src/testing/**'],
      // 核心包 90% 门槛必须由 test target 自身强制，否则「覆盖率达标」只是报告里的数字，
      // 回归时掉到门槛以下不会让任何 Nx target 变红（RXD-043）
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90
      }
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium'
        }
        // {
        //   browser: 'firefox'
        // },
        // {
        //   browser: 'webkit'
        // }
      ]
    }
  }
}));
