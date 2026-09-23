/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-tree-angular',
  plugins: [
    // 包根的 tsconfig.json 是 solution-style（include 为空），必须显式指向 spec tsconfig，
    // 否则插件的 TS program 不含任何文件，spec 会被降级转换甚至清空。
    angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` }),
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-plugin-tree-angular',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  // `@aiao/rxdb-angular` 由 ng-packagr 构建，package.json 没有 exports/main，
  // node 解析找不到它；必须靠 tsconfig paths 指到源码。
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'rxdb-plugin-tree-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-tree-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
