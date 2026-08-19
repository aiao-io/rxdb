/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-electron-test',
  // ELEC-25：没有它，任何 import 了工作区包（`@aiao/rxdb` / `@aiao/rxdb-adapter-electron`）的
  // spec 都会退回 node 解析、落到各包的 `dist/` 上 —— 能不能跑取决于别人有没有先构建过。
  // 与 dev-rxdb-tauri 的 TAURI-06 同一个理由。
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-electron',
    watch: false,
    globals: true,
    // node 而不是 happy-dom：`src-electron/**` 测的是主进程，`src/**` 这边收进来的也
    // 只有不碰 DOM 的纯逻辑（候选表选择、运行时探针）。组件级测试若要加，应另起一个
    // 带 Angular 插件的 project，而不是把整份配置切成浏览器环境。
    environment: 'node',
    include: ['src-electron/**/*.spec.ts', 'src/**/*.spec.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根：Vitest 默认写 `<config root>/coverage`，
    // 而 Nx 推断的 test target 声明的 outputs 是 `{workspaceRoot}/coverage/{projectRoot}`。
    // 不一致 ⇒ CI 的 `coverage/**` 上传步骤找不到文件、门禁与 Codecov 也看不到本项目。
    coverage: {
      include: ['src-electron/**/*.ts', 'src/app/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-electron',
      provider: 'v8'
    }
  }
});
