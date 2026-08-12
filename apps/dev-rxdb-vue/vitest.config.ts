/// <reference types="vitest" />
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { appResolveConfig } from './src/config/vite-resolve.ts';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-vue-test',
  plugins: [vue()],
  resolve: appResolveConfig,
  test: {
    name: 'dev-rxdb-vue',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/dev-rxdb-vue',
      provider: 'v8',
      include: ['src/**/*.{ts,vue}']
    }
  }
});
