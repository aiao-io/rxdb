/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-miniprogram-alipay-probe-test',
  // 没有它，adapter 源码里对工作区包的 import 会退回 node 解析、落到各包的 `dist/` 上，
  // `/runtime` 子路径也只认本项目 tsconfig.json 里的 paths。
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-miniprogram-alipay-probe',
    watch: false,
    globals: true,
    // 测的是支付宝逻辑层：没有 DOM，my / Worker 由 __tests__/fake-alipay.ts 顶替
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根：Nx 推断的 test target 声明的 outputs 是
    // `{workspaceRoot}/coverage/{projectRoot}`，Vitest 默认却写 `<config root>/coverage`。
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-miniprogram-alipay-probe',
      provider: 'v8'
    }
  }
});
