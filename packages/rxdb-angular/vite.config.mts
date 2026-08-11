/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-angular',
  plugins: [
    // 包根的 tsconfig.json 是 solution-style（include 为空），必须显式指向 spec tsconfig，
    // 否则插件的 TS program 不含任何文件，spec 会被降级转换甚至清空。
    // jit: true 让 spec 内联的 @Component/@Directive 由插件编译，而不是落到 vite 的 oxc 转换
    angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` }),
    // Codecov Bundle Analysis - 仅在 CI 环境中启用
    ...(process.env['CI'] === 'true' && process.env['CODECOV_TOKEN'] ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-angular',
          uploadToken: process.env['CODECOV_TOKEN']
        })
      ]
    : [])
  ],
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'rxdb-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    testTimeout: 10000,
    hookTimeout: 10000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/rxdb-angular/junit.xml'
    },
    coverage: {
      reportsDirectory: '../../coverage/packages/rxdb-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html']
    }
  },
  define: {
    'import.meta.vitest': mode !== 'production'
  }
}));
