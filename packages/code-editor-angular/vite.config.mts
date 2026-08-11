/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/code-editor-angular',
  plugins: [
    angular({ jit: true, tsconfig: path.join(import.meta.dirname, 'tsconfig.spec.json') }),
    // Codecov Bundle Analysis - 仅在 CI 环境中启用
    ...(process.env['CI'] === 'true' && process.env['CODECOV_TOKEN'] ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'code-editor-angular',
          uploadToken: process.env['CODECOV_TOKEN']
        })
      ]
    : [])
  ],
  resolve: {
    tsconfigPaths: true
  },
  // 如果使用 workers，请取消下面的注释。
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    name: 'code-editor-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/packages/code-editor-angular/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/code-editor-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
