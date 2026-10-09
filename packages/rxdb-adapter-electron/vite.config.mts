/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/** 备份 / 恢复新增峰值内存的用例（US-217 AC#9），见下方 `projects`。 */
const MEMORY_SPECS = 'src/**/*-backup-memory.spec.ts';

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
        // host 侧只按结构类型引用 PGlite；renderer 侧另外用了 `/template` 那个约 2 KB 的
        // 模板编译子路径。两者一起外置，免得 wasm 被打进本包产物。
        '@electric-sql/pglite',
        '@electric-sql/pglite/template',
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
    // US-217 AC#9 的内存用例按子进程 host 的常驻内存判「不随库线性增长」，与其它文件并行时整机内存吃紧，
    // 操作系统换出 / 压缩页面会让两档之间的 RSS 差值飘出几百 MiB。单独成一组、组内串行，测量时整台机器归它。
    // 两组分属两个 nx target：`test` 只跑第一组，`test-memory` 只跑内存组且不带覆盖率（v8 插桩会抬高 RSS）。
    // `test-memory` 在 project.json 里声明 `parallelism: false`：本地 `pnpm test-all --parallel=4` 跑到它时，
    // Nx 不会同时调度别的任务。
    // CI 上内存组另开一条 lane（scripts/ci/plan-test-lanes.mjs 的 MEMORY_TARGET），不再排在常规用例之后
    // 把整条 lane 拖成长尾。
    projects: [
      {
        extends: true,
        test: {
          name: 'rxdb-adapter-electron',
          include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          exclude: [MEMORY_SPECS]
        }
      },
      {
        extends: true,
        test: {
          name: 'rxdb-adapter-electron:memory',
          include: [MEMORY_SPECS],
          fileParallelism: false,
          sequence: { groupOrder: 1 }
        }
      }
    ],
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
