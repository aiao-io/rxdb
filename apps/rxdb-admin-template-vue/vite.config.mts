/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defaultClientConditions, defineConfig } from 'vite';
import { createBootstrapScript } from '../../packages/rxdb-admin/src/bootstrap.ts';
import { appHtmlPlugin } from './app-html-plugin.ts';

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/rxdb-admin-template-vue',
  resolve: {
    tsconfigPaths: true,
    conditions: sourceConditions
  },
  server: {
    port: 4208,
    host: '127.0.0.1'
  },
  preview: {
    port: 4177,
    host: '127.0.0.1'
  },
  plugins: [appHtmlPlugin(createBootstrapScript), vue(), tailwindcss()],
  worker: {
    format: 'es' as const,
    plugins: () => [vue()]
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
