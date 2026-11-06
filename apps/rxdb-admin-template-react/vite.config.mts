/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { createBootstrapScript } from '../../packages/rxdb-admin/src/bootstrap.ts';
import { appHtmlPlugin } from './app-html-plugin.ts';

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-admin-template-react',
  resolve: {
    tsconfigPaths: true,
    conditions: sourceConditions
  },
  server: {
    port: 4206,
    host: '127.0.0.1'
  },
  preview: {
    port: 4175,
    host: '127.0.0.1'
  },
  plugins: [appHtmlPlugin(createBootstrapScript), react({}), tailwindcss()],
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
