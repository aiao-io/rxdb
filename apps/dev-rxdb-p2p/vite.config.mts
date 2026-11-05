/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-p2p-test',
  plugins: [angular({ tsconfig: './tsconfig.spec.json' }), nxReadySignal()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-p2p',
    watch: false,
    globals: true,
    // 前端用例跑在 happy-dom；Worker 与共用协议的用例在文件头声明 `@vitest-environment node`。
    environment: 'happy-dom',
    pool: 'forks',
    include: ['src/**/*.spec.ts', 'server/**/*.spec.ts', 'shared/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    // 与其它 app 一致：报告落到仓库根的 coverage/apps/<项目名>，Nx 推断的 test target outputs 才对得上。
    coverage: {
      include: ['src/app/**/*.ts', 'server/**/*.ts', 'shared/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-p2p',
      provider: 'v8'
    }
  }
});
