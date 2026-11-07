/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-admin',
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
          bundleName: 'rxdb-admin',
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
    lib: {
      entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
      name: '@aiao/rxdb-admin',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: [/^@aiao\/rxdb-i18n/, '@aiao/rxdb', 'rxjs', 'rxjs/operators'],
      input: {
        index: 'src/index.ts',
        testing: 'src/testing.ts'
      },
      output: {
        entryFileNames: chunkInfo => `${chunkInfo.name}.js`
      }
    }
  },
  resolve: {
    tsconfigPaths: true,
    conditions: ['@aiao/source']
  },
  test: {
    name: 'rxdb-admin',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-admin/junit.xml'
    },
    coverage: {
      reportsDirectory: '../../coverage/packages/rxdb-admin',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/__tests__/**'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 }
    }
  }
}));
