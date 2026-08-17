/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const isBrowserTest = process.env.VITEST_BROWSER === 'true';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-plugin-storage',
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
          bundleName: 'rxdb-plugin-storage',
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
    sourcemap: false,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // `testing` 入口把 `src/__tests__/storage-backend-parity.suite.ts` 打进 `dist/testing.js`，
      // 供 `apps/dev-rxdb-tauri` 的一致性套件直接消费。也就是说：**这份套件是本包的产品面，
      // 不是测试文件**。project.json 因此覆盖了本包的 `production` 命名输入（只排除 `*.spec.ts`），
      // 否则「只改共享套件」既不使本包 build 失效、也不使 Tauri 侧 test-conformance 失效——两边一起假绿。
      entry: {
        index: 'src/index.ts',
        desktop: 'src/desktop.ts',
        testing: 'src/testing.ts'
      },
      name: '@aiao/rxdb-plugin-storage',
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // desktop 入口经 host 协议说话，桌面适配器必须外置：内联会把它复制进浏览器主入口的依赖图。
      // vitest 同理且更硬：testing 入口的断言必须跑在**调用方那一个** vitest 实例上，
      // 内联一份进来，`expect` 就登记不到调用方的测试上下文里。
      external: ['@aiao/rxdb', '@aiao/rxdb-adapter-electron', 'rxjs', 'vitest']
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: {
      allow: ['../../node_modules']
    }
  },
  optimizeDeps: {
    exclude: [
      '@aiao/rxdb-test',
      '@aiao/rxdb-test/entities',
      '@aiao/rxdb',
      '@aiao/utils',
      '@aiao/rxdb-adapter-wa-sqlite',
      'comlink',
      'rxjs',
      'wa-sqlite',
      'wa-sqlite/dist/wa-sqlite-async.mjs',
      'wa-sqlite/dist/wa-sqlite.mjs',
      'wa-sqlite/src/examples/AccessHandlePoolVFS.js',
      'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
      'wa-sqlite/src/examples/MemoryAsyncVFS.js',
      'wa-sqlite/src/examples/MemoryVFS.js',
      'wa-sqlite/src/examples/OPFSAdaptiveVFS.js',
      'wa-sqlite/src/examples/OPFSAnyContextVFS.js',
      'wa-sqlite/src/examples/OPFSCoopSyncVFS.js',
      'wa-sqlite/src/examples/OPFSPermutedVFS.js'
    ],
    include: ['fastest-levenshtein', 'ms', 'uuid']
  },
  test: {
    name: 'rxdb-plugin-storage',
    watch: false,
    globals: true,
    ...(isBrowserTest ?
      {
        include: ['{src,tests}/**/*.browser.{test,spec}.{ts,tsx}'],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          screenshotFailures: false,
          instances: [{ browser: 'chromium' }]
        }
      }
    : {
        environment: 'happy-dom',
        include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['{src,tests}/**/*.browser.{test,spec}.{ts,tsx}'],
        // 桌面后端的一致性用例既要 DOM（套件会装 window、点锚点下载），又要真的把
        // `@aiao/rxdb-adapter-electron/host` 加载起来（它 import `node:sqlite`）。happy-dom 走的是
        // client 环境，Vite 会尝试把这条依赖内联进 bundle 并在 node 内置模块上炸掉；externalize
        // 之后由 Node 原生 ESM 直接加载，两个要求才同时成立。
        server: { deps: { external: [/rxdb-adapter-electron/] } }
      }),
    reporters: ['default', 'junit'],
    // Node / browser 并行时不能共用 coverage 与 junit 产物（Vitest .tmp 会互相删除）。
    // coverage gate 只读 node 目录；browser 写到独立路径。
    outputFile: {
      junit:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-storage-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-storage/junit.xml'
    },
    coverage: {
      // 只由显式带 `--coverage` 的 `coverage` / `test-browser` 两个 target 采集（对齐
      // `rxdb-plugin-search`）。若在这里默认打开，不带 flag 的 `test` target 也会采集，
      // 而它与 `coverage` 写同一个目录、启动时先清空 —— 一旦与 `test-browser` 的合并步骤
      // 撞上，就会读到刚被清掉的 `coverage-final.json`（ENOENT），`test-all` 随之变红。
      enabled: false,
      reportsDirectory:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-storage-browser'
        : '../../coverage/packages/rxdb-plugin-storage',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['**/dist/**', 'src/**/__tests__/**']
    }
  }
}));
