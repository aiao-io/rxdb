/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-admin-template-react-test',
  plugins: [react()],
  test: {
    name: 'rxdb-admin-template-react',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/rxdb-admin-template-react',
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}']
    }
  }
});
