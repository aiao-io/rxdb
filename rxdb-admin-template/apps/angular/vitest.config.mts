/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const appRoot = import.meta.dirname;
/** Angular 绑定包由 ng-packagr 构建、package.json 没有 exports / main，Node 解析不到，页面单测只能指到源码。 */
const source = (name: string): string => resolve(appRoot, '../../../packages', name, 'src/index.ts');

export default defineConfig({
  root: appRoot,
  cacheDir: '../../../node_modules/.vite/apps/rxdb-admin-template-angular-test',
  // jit: true 让插件的 JIT 转换登记页面里的 viewChild 等 signal 查询；
  // 插件要求 tsconfig 能产出 JS，tsconfig.spec.json 因此显式设了 emitDeclarationOnly: false。
  plugins: [angular({ jit: true, tsconfig: resolve(appRoot, 'tsconfig.spec.json') })],
  resolve: {
    alias: {
      '@aiao/rxdb-admin-angular': source('rxdb-admin-angular'),
      '@aiao/rxdb-angular': source('rxdb-angular'),
      '@aiao/rxdb-i18n-angular': source('rxdb-i18n-angular'),
      '@aiao/rxdb-model-angular': source('rxdb-model-angular'),
      '@aiao/rxdb-plugin-search-angular': source('rxdb-plugin-search-angular')
    }
  },
  test: {
    name: 'rxdb-admin-template-angular',
    watch: false,
    globals: true,
    // 插件默认把池切到 vmThreads，该池拿不到 Node 的 BroadcastChannel，RxDB 的多标签网关会初始化失败。
    pool: 'forks',
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/apps/rxdb-admin-template-angular',
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.spec.ts', 'src/test-setup.ts']
    }
  }
});
