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
  root: new URL('.', import.meta.url).pathname,
  plugins: [markdownAsText],
  test: {
    name: 'aiao-model-design-node',
    environment: 'node',
    include: ['server/**/*.spec.ts', 'agent/**/*.spec.ts', 'shared/**/*.spec.ts'],
    clearMocks: true,
    pool: 'forks',
    maxWorkers: 2,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcovonly'],
      reportsDirectory: '../../coverage/apps/aiao-model-design-node',
      include: ['server/**/*.ts', 'agent/**/*.ts', 'shared/**/*.ts'],
      exclude: ['server/index.ts', '**/*.spec.ts', '**/*.d.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 }
    }
  }
});
