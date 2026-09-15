/// <reference types='vitest' />
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-working-tree-angular',
  plugins: [
    ...(process.env.CI === 'true' && process.env.CODECOV_TOKEN ?
      [
        codecovVitePlugin({
          enableBundleAnalysis: true,
          telemetry: false,
          bundleName: 'rxdb-plugin-working-tree-angular',
          uploadToken: process.env.CODECOV_TOKEN
        })
      ]
    : [])
  ],
  // `@aiao/rxdb-angular` 是 ng-packagr 包：它的源 package.json **没有任何入口字段**
  // （无 main / module / exports），于是 pnpm 软链虽然在，vite 却解析不到它。
  // 搬迁前这个 spec 在 `rxdb-angular` 包内、走的是相对路径 `../rxdb.provider`，
  // 所以从来没碰到这一条；搬出来之后只能按包说明符导入。
  // 与 `rxdb-plugin-search-*` 的配置有意不同：那三个包只导入 `@aiao/rxdb-plugin-search`
  // （vite 构建产物，exports 齐全），够不到这个坑。
  // 取 `tsconfig.base.json` 的 paths → **源码**，与 `packages/rxdb-angular/vite.config.mts`
  // 同一套解析，也与 ng-packagr 构建时的解析一致。
  resolve: {
    tsconfigPaths: true
  },
  test: {
    name: 'rxdb-plugin-working-tree-angular',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-working-tree-angular',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
