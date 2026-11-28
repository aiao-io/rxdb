/// <reference types='vitest' />
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

function benchmarkAssetPath(...segments: string[]): string {
  return normalizePath(resolve(import.meta.dirname, ...segments));
}

const gitDemoAssets = ['lg2_opfs_auto.js', 'lg2_opfs_jspi.js', 'lg2_opfs_jspi.wasm'];

const workspacePackages = [
  '@aiao/rxdb',
  '@aiao/rxdb-adapter-pglite',
  '@aiao/rxdb-adapter-sqlite',
  '@aiao/rxdb-adapter-sqlite-core',
  '@aiao/rxdb-adapter-sqlite-wasm',
  '@aiao/rxdb-adapter-sqliteai',
  '@aiao/rxdb-adapter-wa-sqlite',
  '@aiao/rxdb-i18n',
  '@aiao/rxdb-i18n-react',
  '@aiao/rxdb-plugin-search',
  '@aiao/rxdb-test',
  '@aiao/rxdb-test/encrypted',
  '@aiao/rxdb-test/entities',
  '@aiao/rxdb-test/shop',
  '@aiao/rxdb-test/system',
  '@aiao/utils'
];

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../node_modules/.vite/benchmarks',
  resolve: {
    tsconfigPaths: true,
    conditions: ['@aiao/source'],
    dedupe: workspacePackages
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', '@subframe7536/sqlite-wasm']
  },
  server: {
    port: 3200,
    host: 'localhost',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  preview: {
    port: 3201,
    host: 'localhost',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        ...gitDemoAssets.map(asset => ({
          src: benchmarkAssetPath('node_modules/wasm-git', asset),
          dest: 'git-demo/vendor',
          rename: { stripBase: true } as const
        })),
        {
          src: benchmarkAssetPath('../node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'),
          dest: 'official-sqlite-wasm',
          rename: { stripBase: true }
        },
        {
          src: benchmarkAssetPath('../node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-opfs-async-proxy.js'),
          dest: 'official-sqlite-wasm',
          rename: { stripBase: true }
        },
        {
          src: benchmarkAssetPath('../node_modules/@sqliteai/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm'),
          dest: 'sqliteai',
          rename: { stripBase: true }
        },
        {
          src: benchmarkAssetPath(
            '../node_modules/@sqliteai/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-opfs-async-proxy.js'
          ),
          dest: 'sqliteai',
          rename: { stripBase: true }
        }
      ]
    }),
    react({ tsDecorators: true }),
    tailwindcss(),
    nxReadySignal()
  ],
  worker: {
    format: 'es' as const,
    plugins: () => [react({ tsDecorators: true })]
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    rollupOptions: {
      input: {
        main: benchmarkAssetPath('index.html'),
        browserGitOpfsDemo: benchmarkAssetPath('browser-git-opfs-demo.html')
      }
    },
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },
  test: {
    name: 'benchmarks',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 5000,
    // Node benchmark 的纯模块测试和浏览器应用测试共用这一套 Vitest 配置。
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.spec.mjs', 'node/**/*.spec.ts'],
    coverage: {
      enabled: false,
      reportsDirectory: '../coverage/benchmarks',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'lcovonly'],
      include: ['src/analysis/**', 'src/utils/**', 'src/clear-db.ts'],
      exclude: ['**/index.ts', '**/dist/**', 'src/utils/rxdb-factory.ts', 'src/utils/memory-tracker.ts']
    }
  }
}));
