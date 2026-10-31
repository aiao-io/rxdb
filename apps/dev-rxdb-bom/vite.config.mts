/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-bom',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` }), nxReadySignal()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-bom',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    pool: 'forks',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      include: ['src/app/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-bom',
      provider: 'v8' as const
    }
  }
}));
