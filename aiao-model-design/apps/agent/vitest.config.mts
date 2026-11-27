import { defineConfig, type Plugin } from 'vitest/config';

/** 与 trigger.config.ts 的 esbuild 插件一致：把智能体定义的 Markdown 作为字符串导入。 */
const markdownAsText: Plugin = {
  name: 'md-as-text',
  transform(code, id) {
    if (!id.endsWith('.md')) return undefined;
    return { code: `export default ${JSON.stringify(code)};`, map: null };
  }
};

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/aiao-model-design-agent',
  resolve: { tsconfigPaths: true },
  plugins: [markdownAsText],
  test: {
    name: 'aiao-model-design-agent',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../../coverage/aiao-model-design/apps/agent',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
