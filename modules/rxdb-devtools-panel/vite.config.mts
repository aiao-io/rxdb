/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/rxdb-devtools-panel',
  // 面板源码用 `@modules/rxdb-devtools-panel/wire` 引自己的次入口（宿主也用同一个说明符），
  // vitest 得靠 tsconfig paths 才能把它解析回 workspace 源码。
  resolve: {
    tsconfigPaths: true
  },
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
      reportsDirectory: '../../coverage/modules/rxdb-devtools-panel',
      provider: 'v8',
      include: ['src/**/*.ts', 'wire/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts', 'src/test-setup.ts']
    }
  }
});
