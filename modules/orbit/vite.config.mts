/// <reference types='vitest' />
import path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/modules/orbit',
  plugins: [
    dts({
      entryRoot: 'src',
      pathsToAliases: false,
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json')
    })
  ],
  // 库构建只为文档站服务：Docusaurus 的 webpack 不认 tsconfig paths，只能顺着
  // node_modules 软链读 package.json 的 exports，也就是这份 dist。
  // 三个 demo 应用走 vite 的 tsconfigPaths，直接吃 src，不经过这里。
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: false,
    lib: {
      entry: 'src/index.ts',
      name: '@modules/orbit',
      fileName: 'index',
      formats: ['es' as const]
    }
  },
  test: {
    name: 'orbit-protocol',
    watch: false,
    globals: true,
    environment: 'happy-dom',
    testTimeout: 2000,
    hookTimeout: 2000,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '../../coverage/modules/orbit/junit.xml'
    },
    coverage: {
      enabled: true,
      reportsDirectory: '../../coverage/modules/orbit',
      provider: 'v8' as const,
      reporter: ['text', 'json', 'json-summary', 'clover', 'lcovonly', 'html'],
      include: ['src/**/*']
    }
  }
}));
