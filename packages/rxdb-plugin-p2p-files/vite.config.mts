/// <reference types='vitest' />
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-plugin-p2p-files',
  plugins: [dts({ entryRoot: 'src', pathsToAliases: false, tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json') })],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', name: '@aiao/rxdb-plugin-p2p-files', fileName: 'index', formats: ['es'] },
    rolldownOptions: { external: ['@aiao/rxdb', '@aiao/utils', 'rxjs'] }
  },
  test: {
    name: 'rxdb-plugin-p2p-files',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: '../../coverage/packages/rxdb-plugin-p2p-files/junit.xml' },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/packages/rxdb-plugin-p2p-files',
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*'],
      exclude: ['src/**/*.spec.*', 'src/**/*.test.*', 'src/**/*.d.ts', 'src/__tests__/**']
    }
  }
});
