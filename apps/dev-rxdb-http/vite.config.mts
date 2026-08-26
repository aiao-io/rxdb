/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-http-test',
  plugins: [angular({ tsconfig: './tsconfig.spec.json' })],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-http',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    // reportsDirectory 必须显式指向仓库根的 coverage/apps/<项目名>：
    // Nx 给 vite 推断的 test target 声明 `outputs: ["{workspaceRoot}/coverage/{projectRoot}"]`，
    // 而 Vitest 的默认值是 `<config root>/coverage`。两者不一致时 CI 的 `coverage/**`
    // 上传步骤一个文件都找不到，Nx 缓存命中时更是什么都恢复不出来。
    coverage: {
      include: ['src/app/**/*.ts'],
      reportsDirectory: '../../coverage/apps/dev-rxdb-http',
      provider: 'v8'
    }
  }
});
