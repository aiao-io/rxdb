import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.join(import.meta.dirname, 'fixtures'),
  publicDir: false,
  base: './',
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },

  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    outDir: 'dist/test-app',
    emptyOutDir: true,
    rolldownOptions: { input: path.join(import.meta.dirname, 'fixtures/app.html') }
  }
});
