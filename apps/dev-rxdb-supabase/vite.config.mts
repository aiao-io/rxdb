/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-supabase-test',
  plugins: [angular({ tsconfig: './tsconfig.spec.json' })],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-supabase',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default']
  }
});
