import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/aiao-bom-2',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'aiao-bom-2',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    pool: 'forks',
    maxWorkers: 1,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: '../../coverage/apps/aiao-bom-2',
      include: ['src/app/**/*.ts'],
      exclude: ['src/app/core/types.ts', 'src/app/core/*.worker.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
}));
