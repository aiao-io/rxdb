/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveAcceptanceRoot } from './vitest.acceptance-root.mjs';

const packageRoot = import.meta.dirname;
const workspaceRoot = path.resolve(packageRoot, '../..');
const acceptanceRoot = resolveAcceptanceRoot();

export default defineConfig({
  root: packageRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/packages/rxdb-test-coverage-acceptance-unit'),
  resolve: {
    conditions: ['@aiao/source'],
    tsconfigPaths: true
  },
  test: {
    name: 'rxdb-test-coverage-unit',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    testTimeout: 5000,
    browser: {
      enabled: false
    },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: [
      'default',
      [
        'blob',
        {
          outputFile: path.join(acceptanceRoot, 'blobs/unit.json')
        }
      ]
    ],
    coverage: {
      enabled: true,
      clean: true,
      provider: 'v8',
      reporter: ['text-summary'],
      reportOnFailure: true,
      reportsDirectory: path.join(acceptanceRoot, 'unit'),
      // `entities` / `shop` 是发布出去的共享模型（RXT-030），必须与 `src` 同等进分母。
      include: ['src/**/*.ts', 'entities/**/*.ts', 'shop/**/*.ts'],
      // *.suite.ts 是供 adapter 包 import 执行的共享套件（describe/it 工厂），与 *.spec.ts 同属测试代码。
      // vite.config.mts 里已排除，但那份 coverage.enabled 为 false；真正产报告的是这里，必须同步排。
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.suite.ts']
    }
  }
});
