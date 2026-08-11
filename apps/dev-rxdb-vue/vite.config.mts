/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa';
import { appResolveConfig, codemirrorPackages } from './src/config/vite-resolve.ts';

const pwaOptions: Partial<VitePWAOptions> = {
  mode: 'development',
  manifest: {
    description: 'Starter kit for modern web applications',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ],
    name: 'RxDB Vue PWA',
    short_name: 'rxdb',
    theme_color: '#ffffff'
  },
  includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt'],
  devOptions: { enabled: false },
  registerType: 'autoUpdate',
  workbox: { globPatterns: ['**/*.{js,css,html}', '**/*.{svg,png,jpg,gif}', '**/*.{wasm,data}'] }
};

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-vue',
  resolve: appResolveConfig,
  optimizeDeps: {
    include: codemirrorPackages
  },
  server: {
    port: 4203,
    host: 'localhost'
  },
  plugins: [vue(), tailwindcss(), VitePWA(pwaOptions)],
  // Uncomment this if you are using workers.
  worker: {
    format: 'es' as const,
    plugins: () => []
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
