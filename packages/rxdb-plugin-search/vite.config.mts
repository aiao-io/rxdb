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
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-search',
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
          bundleName: 'rxdb-plugin-search',
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
      entry: 'src/index.ts',
      name: '@aiao/rxdb-plugin-search',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: [
        '@aiao/rxdb',
        '@aiao/rxdb-adapter-sqlite-core',
        '@aiao/rxdb-adapter-sqlite-wasm',
        'rxjs',
        'rxjs/operators'
      ],
      input: {
        index: 'src/index.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
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
    include: ['fastest-levenshtein', 'ms', 'uuid'],
    exclude: [
      '@aiao/rxdb',
      '@aiao/rxdb-adapter-sqlite-core',
      '@aiao/rxdb-adapter-sqlite-wasm',
      'comlink',
      'rxjs',
      '@subframe7536/sqlite-wasm',
      '@subframe7536/sqlite-wasm/constant',
      '@subframe7536/sqlite-wasm/idb',
      '@subframe7536/sqlite-wasm/idb-memory',
      '@subframe7536/sqlite-wasm/opfs',
      '@subframe7536/sqlite-wasm/fs-handle'
    ]
  },
  test: {
    name: 'rxdb-plugin-search',
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
          '../../coverage/packages/rxdb-plugin-search-browser/junit.xml'
        : '../../coverage/packages/rxdb-plugin-search/junit.xml'
    },
    coverage: {
      enabled: false,
      reportsDirectory:
        isBrowserTest ?
          '../../coverage/packages/rxdb-plugin-search-browser'
        : '../../coverage/packages/rxdb-plugin-search',
      provider: 'v8' as const,
      reporter: ['text', 'json-summary', 'json', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/__tests__/**', 'src/**/*.spec.*', 'src/**/*.test.*', 'src/**/*.d.ts', '**/dist/**']
    }
  }
}));
