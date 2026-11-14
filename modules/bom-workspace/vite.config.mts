/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/bom-workspace',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` }), nxReadySignal()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'bom-workspace',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    pool: 'forks',
    maxWorkers: 2,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      include: ['src/**/*.ts'],
      exclude: ['src/test-setup.ts', 'src/index.ts'],
      reportsDirectory: '../../coverage/modules/bom-workspace',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary']
    }
  }
}));
