import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// PGlite 的浏览器版是 pthreads WASM，需要 SharedArrayBuffer（跨源隔离）；
// 同时排除 optimizeDeps 让 PGlite 的 `import.meta.url` 能定位到自身的 .wasm / .data。
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['@electric-sql/pglite']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
