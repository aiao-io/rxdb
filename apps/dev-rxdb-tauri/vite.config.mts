/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-tauri-test',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  // TAURI-06：没有它，任何 import 了工作区包（`@aiao/rxdb` / `@aiao/utils`）的
  // spec 都会在 import-analysis 阶段直接挂掉 —— 这正是本 app 此前只有
  // 「纯函数 + 读文件断字符串」测试的原因。dev-rxdb-angular 早就是这个配置。
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-tauri',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default']
  }
});
