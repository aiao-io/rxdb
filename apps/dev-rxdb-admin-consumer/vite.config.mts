import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-admin-consumer',
  resolve: {
    tsconfigPaths: true,
    conditions: sourceConditions
  },
  server: {
    port: 4207,
    host: '127.0.0.1'
  },
  preview: {
    port: 4176,
    host: '127.0.0.1'
  },
  plugins: [react({}), tailwindcss()],
  worker: {
    format: 'es' as const,
    plugins: () => [react({})]
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
}));
