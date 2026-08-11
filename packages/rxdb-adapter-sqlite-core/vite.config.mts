/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => {
  const nodeTestMode = process.argv.includes('--browser.enabled=false');

  return {
    root: import.meta.dirname,
    cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-sqlite-core',
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
            bundleName: 'rxdb-adapter-sqlite-core',
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
        // `testing` 入口把 `src/__tests__/*.suite.ts` 的共享套件整个打进 `dist/testing.js`，
        // 供 rxdb-adapter-sqlite / -sqliteai 直接消费（wa-sqlite / sqlite-wasm 在自己的
        // vite alias 里指向 src，不吃 dist）。也就是说：**这些套件是本包的产品面，不是测试文件**。
        // 所以 project.json 里覆盖了本包的 `production` 命名输入，只排除 `*.spec.ts`，
        // 保留 `__tests__/*.suite.ts` 与 `test-utils.ts`。工作区默认的 `production` 排除
        // `src/**/__tests__/**/*`，会让「只改共享套件」这件事既不使本包 build 失效、
        // 也不使四个适配器的 test（inputs 含 `^production`）失效 —— 四个包一起假绿。
        // 判据：同一份套件四个适配器结果不一致，或改了套件用例数纹丝不动，先查这里。
        entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
        name: '@aiao/rxdb-adapter-sqlite-core',
        fileName: (format: string, entryName: string) => `${entryName}.js`,
        formats: ['es' as const]
      },
      rolldownOptions: {
        // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
        checks: { pluginTimings: false },
        external: [
          '@aiao/rxdb',
          '@aiao/rxdb-adapter-encrypted',
          '@aiao/rxdb-adapter-sqlite-core',
          '@aiao/rxdb-test',
          '@aiao/rxdb-test/entities',
          '@aiao/rxdb-test/shop',
          '@aiao/utils',
          'comlink',
          'rxjs',
          'vitest'
        ]
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
      include: ['fastest-levenshtein', 'ms', 'uuid'],
      exclude: [
        '@aiao/rxdb-test',
        '@aiao/rxdb-test/entities',
        '@aiao/rxdb-test/shop',
        '@aiao/rxdb',
        '@aiao/utils',
        'comlink',
        'rxjs'
      ]
    },
    test: {
      name: 'rxdb-adapter-sqlite-core',
      watch: false,
      globals: true,
      testTimeout: process.env.CI ? 30000 : 5000,
      hookTimeout: process.env.CI ? 30000 : 10000,
      include: ['{src,tests,__tests__}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: nodeTestMode ? [] : ['src/__tests__/system-schema-migration.multiprocess.spec.ts'],
      reporters: ['default', 'junit'],
      outputFile: {
        junit: '../../coverage/packages/rxdb-adapter-sqlite-core/junit.xml'
      },
      coverage: {
        enabled: true,
        reportsDirectory: '../../coverage/packages/rxdb-adapter-sqlite-core',
        provider: 'v8' as const,
        reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
        include: ['src/**/*'],
        exclude: ['src/__tests__/**', '**/dist/**']
      },
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        screenshotFailures: false,
        instances: [
          {
            browser: 'chromium'
          }
        ]
      }
    }
  };
});
