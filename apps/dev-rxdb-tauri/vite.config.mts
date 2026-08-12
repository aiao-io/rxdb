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
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根：Vitest 默认写 `<config root>/coverage`，
    // 而 Nx 推断的 test target 声明的 outputs 是 `{workspaceRoot}/coverage/{projectRoot}`。
    // 不一致 ⇒ CI 的 `coverage/**` 上传步骤找不到文件、门禁与 Codecov 也看不到本项目。
    coverage: {
      include: ['src/app/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-tauri',
      provider: 'v8'
    }
  }
});
