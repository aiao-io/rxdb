/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ command }) => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-test',
  plugins:
    command === 'build' ?
      [
        dts({
          entryRoot: 'src',
          tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
          pathsToAliases: false
        }),
        {
          name: 'rxdb-client-generator-vite-plugin',
          closeBundle: () => {
            // emptyOutDir 会清掉 buildStart 产物，生成必须放 closeBundle。
            // 必须走真实 CLI：Windows 上空壳 cli.js / isCliEntry 失败都要在这里打红。
            execFileSync(process.execPath, ['../rxdb-client-generator/dist/cli.js', './rxdb.config.ts'], {
              stdio: 'inherit',
              cwd: import.meta.dirname
            });
            for (const entry of ['entities', 'shop']) {
              const generated = path.join(import.meta.dirname, 'dist', entry, 'index.js');
              if (!existsSync(generated)) {
                throw new Error(`rxdb-client-generator 未写出 ${generated}`);
              }
            }
          }
        },
        ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
          [
            codecovVitePlugin({
              enableBundleAnalysis: true,
              telemetry: false,
              bundleName: 'rxdb-test',
              uploadToken: process.env.CODECOV_TOKEN
            })
          ]
        : [])
      ]
    : [],
  // 如果使用 workers，请取消下面的注释。
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  // 库构建配置。
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // 也可以是字典或多个入口数组。
      entry: {
        index: 'src/index.ts',
        'encrypted/index': 'src/encrypted/index.ts',
        'transaction/index': 'src/transaction/index.ts',
        'tree-unique/index': 'src/tree-unique/index.ts'
      },
      name: '@aiao/rxdb-test',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: ['@aiao/rxdb', '@aiao/rxdb-adapter-encrypted', 'vitest', 'rxjs', /^@aiao\//, /^rxjs\//],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js'
      }
    }
  },
  test: {
    name: 'rxdb-test',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    testTimeout: 5000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: false,
      reportsDirectory: '../../coverage/packages/rxdb-test',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'json', 'html'],
      include: ['src/**/*.ts'],
      // *.suite.ts 是供 adapter 包导入执行的共享测试套件（describe/it 工厂），
      // 与 *.spec.ts 同属测试代码，不计入本包源码覆盖率
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.suite.ts']
    }
  }
}));
