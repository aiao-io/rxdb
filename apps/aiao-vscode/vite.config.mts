/// <reference types='vitest' />
import angular from '@analogjs/vite-plugin-angular';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/aiao-vscode',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: {
    // @aiao/code-editor-angular 与 @aiao/rxdb-angular 没有发布型 exports，测试按 base paths 走源码
    tsconfigPaths: true
  },
  // 工作台的 OPFS Git 与 JSPI WASM 需要跨源隔离；基准浏览器用例与 vitest 的浏览器实例共用此服务
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  test: {
    watch: false,
    exclude: [...configDefaults.exclude, 'src/workbench/tmp/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/aiao-vscode',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      include: ['src/app/**/*.ts', 'src/workbench/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/workbench/tmp/**']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'aiao-vscode-ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          include: ['src/app/**/*.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'aiao-vscode-workbench',
          globals: true,
          environment: 'node',
          include: ['src/workbench/**/*.spec.ts'],
          testTimeout: 30000,
          hookTimeout: 30000
        }
      },
      {
        extends: true,
        test: {
          // 用例自带 Chromium（playwright.launch + 本地 HTTP 服务），跑在 node 环境而非 vitest 浏览器模式；
          // 串行执行，避免多个真实浏览器实例互相抢 CPU 超时
          name: 'aiao-vscode-browser',
          globals: true,
          environment: 'node',
          include: ['src/benchmark/**/*.spec.ts'],
          testTimeout: 60000,
          hookTimeout: 60000,
          maxWorkers: 1
        }
      }
    ]
  }
});
