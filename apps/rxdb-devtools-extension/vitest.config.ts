/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-devtools-extension',
  // background / content / devtools 三段都从 `@modules/rxdb-devtools-panel/wire` 引 wire 契约。
  // 该 library 不是 pnpm workspace 成员（同 modules/ 其余成员，见 pnpm-workspace.yaml），
  // 没有 node_modules 软链可走，只能靠 tsconfig paths 解析回源码 —— 与 vite.config.ts
  // 的构建期设置、以及 library 自己的 vite.config.mts 保持同一条解析路径。
  resolve: {
    tsconfigPaths: true
  },
  plugins: [angular({ jit: true, tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  test: {
    name: 'rxdb-devtools-extension',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/rxdb-devtools-extension',
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/vite-env.d.ts']
    }
  }
});
