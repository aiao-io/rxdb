/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-devtools-panel',
  plugins: [angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  test: {
    name: 'rxdb-devtools-panel',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,wire}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/rxdb-devtools-panel',
      provider: 'v8',
      include: ['src/**/*.ts', 'wire/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', 'src/test-setup.ts']
    }
  }
});
