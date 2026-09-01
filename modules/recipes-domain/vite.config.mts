/// <reference types='vitest' />
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/recipes-domain',
  // 单测打在**源码**上：`@aiao/rxdb` 经 tsconfig paths 直吃 src（同 packages/rxdb-adapter-electron）。
  resolve: {
    tsconfigPaths: true
  },
  plugins: [
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    })
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: false,
    lib: {
      entry: 'src/index.ts',
      name: '@modules/recipes-domain',
      fileName: 'index',
      formats: ['es' as const]
    },
    rolldownOptions: {
      external: ['@aiao/rxdb', 'rxjs']
    }
  },
  test: {
    name: 'recipes-domain',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      include: ['src/**/*.ts'],
      reportsDirectory: '../../coverage/modules/recipes-domain',
      provider: 'v8'
    }
  }
}));
