/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Vite 构建配置
 * 用于构建 code-editor 库，支持 TypeScript、测试和代码覆盖率
 */
export default defineConfig(() => ({
  // 设置项目根目录
  root: import.meta.dirname,
  // 设置缓存目录，避免与主项目的缓存冲突
  cacheDir: '../../node_modules/.vite/packages/code-editor',
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
          bundleName: 'code-editor',
          telemetry: false,
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  // 如果使用 workers，请取消下面的注释。
  // worker: {
  //  plugins: [],
  // },
  // 库构建配置
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    // 输出目录
    outDir: './dist',
    // 构建前清空输出目录
    emptyOutDir: true,
    // 报告压缩后的大小
    reportCompressedSize: true,
    sourcemap: false,
    commonjsOptions: {
      transformMixedEsModules: true
    },
    lib: {
      // 库入口文件
      entry: 'src/index.ts',
      name: '@aiao/code-editor',
      fileName: 'index',
      // 支持的输出格式
      formats: ['es' as const]
    },
    rolldownOptions: {
      // dts 插件生成声明文件天然比 Rolldown 原生链接阶段慢，抑制误报的 PLUGIN_TIMINGS 警告
      checks: { pluginTimings: false },
      // 不应打包到库中的外部包
      external: [
        '@codemirror/lang-css',
        '@codemirror/lang-html',
        '@codemirror/lang-javascript',
        '@codemirror/lang-json',
        '@codemirror/lang-markdown',
        '@codemirror/lang-python',
        '@codemirror/lang-sass',
        '@codemirror/lang-sql',
        '@codemirror/lang-xml',
        '@codemirror/language',
        '@codemirror/language-data'
      ]
    }
  },
  // 测试配置
  test: {
    name: 'code-editor',
    // 不启用监听模式
    watch: false,
    // 使用全局测试 API
    globals: true,
    // 没有测试文件时不报错
    // 测试环境
    environment: 'node',
    // 测试超时时间
    testTimeout: 5000,
    // 测试文件匹配模式
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // 报告器配置
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/code-editor/junit.xml'
    },
    // 代码覆盖率配置
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/code-editor',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
