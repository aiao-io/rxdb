/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-search-angular',
  plugins: [
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-plugin-search-angular',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  test: {
    name: 'rxdb-plugin-search-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-search-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
