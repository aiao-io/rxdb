import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defaultClientConditions, defineConfig } from 'vite';
import { offlineBuild } from './tools/offline-build.mjs';

export default defineConfig({
  root: import.meta.dirname,
  base: process.env['DESKTOP_BASE'] ?? '/',
  cacheDir: '../../node_modules/.vite/apps/web-desktop',
  resolve: { conditions: ['@aiao/source', ...defaultClientConditions] },
  server: { port: 4300, host: '127.0.0.1' },
  preview: { port: 4300, host: '127.0.0.1' },
  plugins: [react(), nxReadySignal(), offlineBuild()],
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    rolldownOptions: {
      input: Object.fromEntries(
        ['index', 'files', 'editor', 'settings', 'catalog', 'notes', 'sample-angular', 'sample-react', 'sample-vue'].map(name => [
          name,
          resolve(import.meta.dirname, `${name}.html`)
        ])
      )
    }
  }
});
