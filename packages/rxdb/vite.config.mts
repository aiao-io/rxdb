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
      // 也可以是字典或多个入口数组。
      entry: 'src/index.ts',
      name: '@aiao/rxdb',
      fileName: 'index',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/utils', 'rxjs', 'type-fest', 'uuid']
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
      exclude: ['src/__tests__/**'],
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
