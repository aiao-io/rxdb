/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa';

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
    name: 'RxDB React PWA',
    short_name: 'rxdb',
    theme_color: '#ffffff'
  },
  includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt'],
  devOptions: { enabled: false },
  registerType: 'autoUpdate',
  workbox: { globPatterns: ['**/*.{js,css,html}', '**/*.{svg,png,jpg,gif}', '**/*.{wasm,data}'] }
};

const sourceConditions = ['@aiao/source', ...defaultClientConditions];

const codemirrorPackages = [
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/theme-one-dark',
  '@codemirror/view',
  'codemirror'
];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-react',
  resolve: {
    tsconfigPaths: true,
    conditions: sourceConditions,
    dedupe: codemirrorPackages
  },
  optimizeDeps: {
    include: codemirrorPackages
  },
  server: {
    port: 4201,
    host: '127.0.0.1'
  },
  preview: {
    port: 4173,
    host: '127.0.0.1'
  },
  plugins: [react({}), tailwindcss(), VitePWA(pwaOptions)],
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
