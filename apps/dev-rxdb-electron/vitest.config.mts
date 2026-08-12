/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-electron-test',
  test: {
    name: 'dev-rxdb-electron',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src-electron/**/*.spec.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根：Vitest 默认写 `<config root>/coverage`，
    // 而 Nx 推断的 test target 声明的 outputs 是 `{workspaceRoot}/coverage/{projectRoot}`。
    // 不一致 ⇒ CI 的 `coverage/**` 上传步骤找不到文件、门禁与 Codecov 也看不到本项目。
    coverage: {
      include: ['src-electron/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-electron',
      provider: 'v8'
    }
  }
});
