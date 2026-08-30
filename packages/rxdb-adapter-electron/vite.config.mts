/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-electron',
  // 单测必须打在**源码**上，而不是 workspace 链接指过去的 `dist/`。
  // 少了这一行，`@aiao/rxdb-adapter-sqlite-core` 会走 node_modules 软链读它的产物，
  // 再由产物去读 `@aiao/rxdb-adapter-encrypted/dist`（压缩过）—— 于是 `EncryptedError`
  // 基类靠 `new.target.name` 写入的 `name` 退化成 mangle 后的单字母，
  // 加密契约套件里对 `name` 的断言全线报假失败。
  // 兄弟包（wa-sqlite / pglite）本来就是这么配的，这里只是补齐。
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
          telemetry: false,
          bundleName: 'rxdb-adapter-electron',
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
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      entry: {
        index: 'src/index.ts',
        host: 'src/host.ts',
        pglite: 'src/pglite.ts',
        'pglite-host': 'src/pglite-host.ts'
      },
      name: '@aiao/rxdb-adapter-electron',
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // host 入口本来就只在 Node 侧加载，node: 内建必须外置，否则 rolldown 会当浏览器目标
      // 把它们替换成空的浏览器 stub —— 产物照样构建成功，直到运行时 `path.resolve` 变成
      // `undefined is not a function` 才炸。用前缀匹配兜住全部内建，别再逐个点名漏掉新引入的。
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-pglite',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/rxdb-adapter-sqlite-core/desktop-host',
        '@aiao/utils',
        // PGlite 只被类型引用（host 侧的 runtime 是结构类型），但 `./pglite` 入口会经由
        // `@aiao/rxdb-adapter-pglite` 间接连上它；外置掉，免得 wasm 被打进本包产物。
        '@electric-sql/pglite',
        'rxjs',
        /^node:/
      ]
    }
  },
  test: {
    name: 'rxdb-adapter-electron',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: process.env.CI ? 30000 : 10000,
    hookTimeout: process.env.CI ? 30000 : 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-electron/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-electron',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', '**/dist/**']
    }
  }
}));
