/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-replay-angular',
  plugins: [
    // 包根 tsconfig.json 是 solution-style，须显式指向 spec tsconfig；jit 让 signal input / output 由插件编译
    angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` }),
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-plugin-replay-angular',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  test: {
    name: 'rxdb-plugin-replay-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-replay-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
