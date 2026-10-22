/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-react-test',
  plugins: [react()],
  // 与 vite.config.mts 同一套解析（Vue 端单测同样如此）：经 tsconfig paths 取工作区源码，
  // 页面用到、package.json 未声明的工作区包（如工作树插件的 React 绑定）测试里才解析得到
  resolve: {
    tsconfigPaths: true,
    conditions: ['@aiao/source', ...defaultClientConditions]
  },
  test: {
    name: 'dev-rxdb-react',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/dev-rxdb-react',
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}']
    }
  }
});
