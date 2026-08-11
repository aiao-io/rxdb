/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const CLI_ENTRY_SUFFIX = `${path.sep}src${path.sep}cli${path.sep}cli.ts`;

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-client-generator',
  plugins: [
    {
      name: 'rxdb-client-generator-cli-shebang',
      transform(code, id) {
        if (id.endsWith(CLI_ENTRY_SUFFIX) && code.startsWith('#!/usr/bin/env node')) {
          return {
            code: code.replace(/^#!\/usr\/bin\/env node\n/, ''),
            map: null
          };
        }

        return null;
      },
      renderChunk(code, chunk) {
        if (chunk.fileName === 'cli.js') {
          return {
            code: `#!/usr/bin/env node\n${code}`,
            map: null
          };
        }

        return null;
      }
    },
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
          bundleName: 'rxdb-client-generator',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
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
    sourcemap: false,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // 也可以是字典或多个入口数组。
      entry: 'src/index.ts',
      name: '@aiao/rxdb-client-generator',
      fileName: 'index',
      // 改成你需要支持的格式。
      // 别忘了同步更新 package.json。
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不打进库里的外部依赖。
      external: [
        'ts-morph',
        '@aiao/utils',
        '@aiao/rxdb',
        'jiti',
        'path',
        'fs',
        'fs/promises',
        'glob',
        'node:events',
        'node:module',
        'node:url',
        'node:child_process',
        'node:stream',
        'node:string_decoder',
        'node:url',
        'node:path',
        'node:fs',
        'node:fs/promises'
      ],
      input: {
        index: 'src/index.ts',
        cli: 'src/cli/cli.ts',
        vite: 'src/plugins/vite.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
    }
  },
  test: {
    name: 'rxdb-client-generator',
    watch: false,
    globals: true,
    environment: 'node',
    // 本包的用例要把生成的代码真正喂给 TypeScript 编译（最慢的单条约 4.2s）。
    // 写死 15s 在 `nx run-many --parallel=4` 下会被 browser-mode 项目挤到超时：
    // `build-client-lib.spec.ts > removes only stale manifest-owned files` 实测两轮全量各挂一次，
    // 单独跑却 4/4 全过 —— 是资源竞争型超时，不是随机 flake。
    // 取值与同样偏重的 pglite / wa-sqlite 对齐。
    testTimeout: process.env.CI ? 120000 : 30000,
    hookTimeout: process.env.CI ? 120000 : 30000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-client-generator/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-client-generator',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/__tests__/**']
    }
  }
}));
