/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-encrypted',
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
          bundleName: 'rxdb-adapter-encrypted',
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
        testing: 'src/testing.ts'
      },
      name: '@aiao/rxdb-adapter-encrypted',
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: ['@aiao/rxdb', 'rxjs']
    }
  },
  test: {
    name: 'rxdb-adapter-encrypted',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 5000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-adapter-encrypted/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-adapter-encrypted',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
