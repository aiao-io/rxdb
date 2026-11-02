/// <reference types='vitest' />
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/browser-workbench-react',
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      aliasesExclude: [/^@aiao\//],
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    })
  ],
  resolve: { tsconfigPaths: true, conditions: ['@aiao/source'], dedupe: ['react'] },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', fileName: 'index', formats: ['es'] },
    rolldownOptions: {
      checks: { pluginTimings: false },
      external: ['@aiao/browser-workbench', '@aiao/code-editor-react', 'react', 'react-dom', 'react/jsx-runtime']
    }
  },
  test: {
    name: 'browser-workbench-react',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/browser-workbench-react',
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcovonly'],
      include: ['src/**/*']
    }
  }
});
