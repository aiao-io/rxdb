/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
// 本 app 自己的 node_modules 里是 Taro 用的 vite 6，`defineConfig` 从 vitest 取，免得两份 vite 混用
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-miniprogram-test',
  resolve: {
    // 包的 exports 不带 `@aiao/source` 条件时指向 dist/，单测不该依赖上游 build。/runtime 入口的依赖闭包全是包内相对路径
    alias: {
      '@aiao/rxdb-adapter-miniprogram/runtime': fileURLToPath(
        new URL('../../packages/rxdb-adapter-miniprogram/src/runtime.ts', import.meta.url)
      )
    }
  },
  test: {
    name: 'dev-rxdb-miniprogram',
    watch: false,
    // 测的是构建期插件与小程序逻辑层的预检：都没有 DOM
    environment: 'node',
    include: ['config/**/*.spec.ts', 'src/**/*.spec.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根：Nx 推断的 test target 声明的 outputs 是
    // `{workspaceRoot}/coverage/{projectRoot}`，Vitest 默认却写 `<config root>/coverage`。
    coverage: {
      include: ['config/**/*.ts', 'src/**/*.ts'],
      exclude: ['**/__tests__/**'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-miniprogram',
      provider: 'v8'
    }
  }
});
