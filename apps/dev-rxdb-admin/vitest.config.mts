/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-admin-test',
  plugins: [react()],
  test: {
    name: 'dev-rxdb-admin',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/dev-rxdb-admin',
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}']
    }
  }
});
