import { defineConfig } from 'vitest/config';

/**
 * web 里与框架无关的磁盘与虚拟机逻辑在 Node 下跑单测（`src/app/disk`、`src/app/vm`）。
 * 真实 OPFS、Vivari 与界面行为由正式构建上的冒烟覆盖（`aiao-desktop-e2e:e2e`）。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-desktop/apps/web-test',
  test: {
    name: 'aiao-desktop-web',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/aiao-desktop/apps/web',
      include: ['src/app/disk/**/*.ts', 'src/app/vm/**/*.ts'],
      exclude: ['src/**/*.spec.ts']
    }
  }
});
