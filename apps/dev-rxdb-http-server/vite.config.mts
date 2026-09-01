/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-http-server-test',
  // 单测必须打在**源码**上，而不是 workspace 链接指过去的 `dist/`：`@aiao/rxdb` /
  // `@aiao/rxdb-adapter-pglite` / `@modules/recipes-domain` 都经 tsconfig paths 直吃 src
  // （与 packages/rxdb-adapter-electron 的兄弟包同一口径）。
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'dev-rxdb-http-server',
    watch: false,
    globals: true,
    // 参考后端跑在 Node 上（node:http / node:sqlite / node:crypto），不需要 DOM 垫片。
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根的 coverage/apps/<项目名>：
    // Nx 给 vite 推断的 test target 声明 `outputs: ["{workspaceRoot}/coverage/{projectRoot}"]`，
    // 而 Vitest 的默认值是 `<config root>/coverage`。两者不一致时 CI 的 coverage 上传一个文件都找不到。
    coverage: {
      include: ['src/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-http-server',
      provider: 'v8'
    }
  }
});
