/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// 提案配置：与应用现有 vitest.config.mts 相比，增加 Angular 编译插件（JIT）、tsconfig 路径别名与 setup 文件。
export default defineConfig({
  root: import.meta.dirname + '/..',
  cacheDir: '../../../node_modules/.vite/apps/rxdb-admin-template-angular-scratch-d-proposal',
  plugins: [angular({ jit: true, tsconfig: `${import.meta.dirname}/../tsconfig.spec.json` })],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'scratch-d-angular-proposal',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.scratch.ts'],
    setupFiles: ['src/scratch-d/test-setup.ts'],
    reporters: ['default']
  }
});
