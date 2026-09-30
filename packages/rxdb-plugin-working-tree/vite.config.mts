/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-working-tree',
  plugins: [
    dts({
      entryRoot: 'src',
      aliasesExclude: [/^@aiao\//],
      compilerOptions: {
        baseUrl: import.meta.dirname,
        paths: {
          '@aiao/rxdb': ['../rxdb/src/index.ts'],
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
          bundleName: 'rxdb-plugin-working-tree',
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
      // 多入口：`./testing` 是独立子路径导出，必须单独成产物。
      // 它承载两套工作树 conformance 套件，最终会 `import 'vitest'`——
      // 并进主入口等于让运行时入口背上测试框架。
      // package.json 的 `./testing` 指向 dist/working-tree/testing/index.js，
      // 漏登记这一条就是死链（scripts/audit/subpath-build-entries.mjs 守这条）。
      entry: { index: 'src/index.ts', 'working-tree/testing/index': 'src/working-tree/testing/index.ts' },
      name: '@aiao/rxdb-plugin-working-tree',
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。`@aiao/rxdb` 必须外置且理由比别的更硬：本包靠
      // `setWorkingTreeCaptureHook()` 往核心的适配器基类上装运行时，内联一份核心进来，
      // 装上去的就是**另一个模块实例**的槽位，宿主那一份永远是 undefined。
      // `vitest` 同理——`./testing` 入口的断言必须登记到调用方那一个 vitest 实例上。
      //
      // `@aiao/rxdb-plugin-history` 同属这一档，只是理由晚到：US-025 把 `VersionManager`
      // 从核心搬进了它，本包的 `enable-migration.ts` 于是从那里取值。漏登记它的代价有两层——
      // 表层是产物里多出一条**未声明**的 `import '@aiao/utils'`（历史插件自己的依赖被一起内联
      // 带了进来），而 `@aiao/utils` 不在本包的 dependencies 里，谁从 dist 解析本包就在那一行
      // 炸掉；深层是历史插件被复制成第二份实例，宿主的 `rxdb.versionManager` 与
      // `inject: ['plugin:history']` 认的都不会是它。
      external: ['@aiao/rxdb', '@aiao/rxdb-plugin-history', '@aiao/utils', 'rxjs', 'uuid', 'vitest']
    }
  },
  test: {
    name: 'rxdb-plugin-working-tree',
    watch: false,
    globals: true,
    testTimeout: 5000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-plugin-working-tree/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-working-tree',
      // istanbul provider 支持多 browser instances（v8 仅支持单实例）；
      // 多浏览器矩阵下统一用 istanbul
      provider: 'istanbul' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      // `src/working-tree/testing/**` 与 `src/__tests__/**` 同类：都是测试代码，不是被测面。
      // 区别只在它经 `./testing` 子路径发布出去，由 6 个适配器包的 conformance 调用点执行——
      // 本包自己的 `test` 一行都跑不到。计进来量的不是插件覆盖率，而是「这份套件在错误的包里
      // 跑没跑」，答案恒为否：套件每长一节，functions 就掉一截。
      exclude: ['src/__tests__/**', 'src/working-tree/testing/**'],
      // 90% 门槛必须由 test target 自身强制，否则「覆盖率达标」只是报告里的数字，
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
      ]
    }
  }
}));
