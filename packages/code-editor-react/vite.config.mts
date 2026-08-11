/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/code-editor-react',
  plugins: [
    react(),
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
          bundleName: 'code-editor-react',
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
      // 也可以是字典或多个入口数组。
      entry: 'src/index.ts',
      name: '@aiao/code-editor-react',
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
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@aiao/code-editor',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/state',
        '@codemirror/theme-one-dark',
        '@codemirror/view',
        'codemirror'
      ]
    }
  },
  test: {
    name: 'code-editor-react',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/code-editor-react/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/code-editor-react',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
