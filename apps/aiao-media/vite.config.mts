import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/aiao-media',
  plugins: [angular({ tsconfig: `${import.meta.dirname}/tsconfig.spec.json` })],
  test: {
    watch: false,
    coverage: { provider: 'v8', reportsDirectory: './coverage' },
    projects: [
      {
        extends: true,
        test: {
          name: 'aiao-media-ui',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
          include: ['src/app/**/*.spec.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'aiao-media-data',
          globals: true,
          environment: 'happy-dom',
          include: ['src/contracts/**/*.spec.ts', 'src/local-data/**/*.spec.ts']
        }
      }
    ]
  }
});
