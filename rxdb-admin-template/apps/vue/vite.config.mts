/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { defaultClientConditions, defineConfig, type Plugin } from 'vite';
import { createBootstrapScript } from '../../../packages/rxdb-admin/src/bootstrap.ts';
import { appHtmlPlugin } from './app-html-plugin.ts';

const offlineShell: Plugin = {
  name: 'collaboration-offline-shell',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'collaboration-sw.js', source: readFileSync(new URL('../../packages/collaboration/public/collaboration-sw.js', import.meta.url), 'utf8') }); },
  configureServer(server) { server.middlewares.use('/collaboration-sw.js', (_request, response) => { response.setHeader('Content-Type', 'application/javascript'); response.end(readFileSync(new URL('../../packages/collaboration/public/collaboration-sw.js', import.meta.url), 'utf8')); }); }
};

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/rxdb-admin-template-vue',
  resolve: {
    tsconfigPaths: true,
    conditions: sourceConditions
  },
  server: {
    port: 4208,
    host: '127.0.0.1',
    proxy: {
      '/collaboration-api': { target: process.env['ADMIN_API_URL'] ?? 'http://127.0.0.1:8088', changeOrigin: true }
    }
  },
  preview: {
    port: 4177,
    host: '127.0.0.1',
    proxy: {
      '/collaboration-api': { target: process.env['ADMIN_API_URL'] ?? 'http://127.0.0.1:8088', changeOrigin: true }
    }
  },
  plugins: [offlineShell, appHtmlPlugin(createBootstrapScript), vue(), tailwindcss()],
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
