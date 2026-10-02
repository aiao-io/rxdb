/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig, transformWithEsbuild } from 'vite';
import dts from 'vite-plugin-dts';

const isBrowserTest = process.env.VITEST_BROWSER === 'true';
const legacyDecoratorRE = /(?:^|\n)\s*@[A-Za-z_$][\w$]*(?:\s*\(|\s*\n|\s*$)/;

const legacyDecoratorTransform = () => ({
  name: 'legacy-decorator-transform',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    const file = id.split('?', 1)[0];
    if (!file.endsWith('.ts') || !legacyDecoratorRE.test(code)) return null;
    const result = await transformWithEsbuild(code, file, {
      loader: 'ts',
      format: 'esm',
      sourcemap: true,
      target: 'es2022',
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true
        }
      }
    });
    return {
      code: result.code,
      map: result.map
    };
  }
});

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-replay',
  plugins: [
    legacyDecoratorTransform(),
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
          bundleName: 'rxdb-plugin-replay',
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
      // 多入口：`./testing` 是独立子路径导出（三框架封装共用的 parity 契约），必须单独成产物。
      // package.json 的 `./testing` 指向 dist/testing/index.js，漏登记这一条就是死链
      // （scripts/audit/subpath-build-entries.mjs 守这条）。
      entry: { index: 'src/index.ts', 'testing/index': 'src/testing/index.ts' },
      name: '@aiao/rxdb-plugin-replay',
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // `rrweb` 必须外置：插件只经 `import('rrweb')` 按需加载它，内联进来等于让「装了插件但没开录制」
      // 的应用也背上整个录制器（FR-022 / SC-008 的预算不计 rrweb，前提就是它不在本包产物里）。
      external: ['@aiao/rxdb', '@aiao/rxdb-plugin-working-tree', '@aiao/utils', '@rrweb/types', 'rrweb', 'rxjs']
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
  resolve: {
    tsconfigPaths: true,
    conditions: ['@aiao/source']
  },
  optimizeDeps: {
    include: ['fastest-levenshtein', 'ms', 'uuid', 'rrweb'],
    exclude: ['@aiao/rxdb', '@aiao/rxdb-adapter-pglite', '@aiao/rxdb-plugin-working-tree', '@aiao/utils', 'rxjs']
  },
  test: {
    name: 'rxdb-plugin-replay',
    watch: false,
    globals: true,
    testTimeout: process.env.CI ? 30000 : 10000,
    hookTimeout: process.env.CI ? 30000 : 15000,
    ...(isBrowserTest ?
      {
        include: ['{src,tests,__tests__}/**/*.browser.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          screenshotFailures: false,
          instances: [{ browser: 'chromium' }]
        }
      }
    : {
        environment: 'node',
        include: ['{src,tests,__tests__}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['{src,tests,__tests__}/**/*.browser.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
      }),
    reporters: ['default', 'junit'],
    // Node / browser 先写独立中间产物，test-browser 完成后再合并到 coverage gate 读取的 node 目录。
    outputFile: {
      junit:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-replay-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-replay/junit.xml'
    },
    coverage: {
      enabled: false,
      reportsDirectory:
        isBrowserTest ? '../../coverage/packages/rxdb-plugin-replay-browser' : '../../coverage/packages/rxdb-plugin-replay',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'json', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      // 回放组件（`src/replayer/`）要真 DOM + rrweb Replayer，只有浏览器趟测得到；node 趟不切掉它就把它算成 0 覆盖，
      // 门槛必然挂（同 rxdb-plugin-tree 的切法）。浏览器趟仍收全量，合并后的总数由 `pnpm audit:coverage` 把关。
      exclude: [
        'src/__tests__/**',
        'src/**/*.spec.*',
        'src/**/*.test.*',
        'src/**/*.d.ts',
        '**/dist/**',
        ...(isBrowserTest ? [] : ['src/replayer/**'])
      ],
      // 公开包门槛 80，见 scripts/audit/coverage-check.mjs。只挂在 node 这一趟（理由同 rxdb-plugin-search）。
      ...(isBrowserTest ?
        {}
      : {
          thresholds: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80
          }
        })
    }
  }
}));
