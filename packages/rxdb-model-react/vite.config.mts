/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-model-react',
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
      // 测试辅助模块不随库发布，排除出声明产物
      exclude: ['src/__tests__/**']
    }),
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-model-react',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  resolve: {
    // workspace 内 @aiao/* 一律走源码（与 rxdb-model-angular 同配置），
    // 避免解析到 pnpm store 里的过期 dist 副本
    tsconfigPaths: true
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      entry: 'src/index.ts',
      name: 'rxdb-model-react',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      external: [
        /^@aiao\//,
        'react',
        'react-dom',
        'react/jsx-runtime',
        'rxjs',
        'lucide-react',
        '@visactor/vtable',
        '@visactor/vtable-editors'
      ]
    }
  },
  test: {
    name: 'rxdb-model-react',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/testing/setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-model-react',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
