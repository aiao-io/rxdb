/// <reference types="vitest" />
// 本 app 自己的 node_modules 里是 Taro 用的 vite 6，`defineConfig` 从 vitest 取，免得两份 vite 混用
import { defineConfig } from 'vitest/config';

/** 断言 `build-weapp` / `build-tt` 的产物（`verify-dist` target），不进单测的 `test` target：没构建时产物不存在。 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-miniprogram-verify-dist',
  test: {
    name: 'dev-rxdb-miniprogram-verify-dist',
    watch: false,
    environment: 'node',
    include: ['verify/**/*.spec.ts'],
    reporters: ['default']
  }
});
