import { esbuildPlugin } from '@trigger.dev/build/extensions';
import { defineConfig } from '@trigger.dev/sdk';
import { readFile } from 'node:fs/promises';

const project = process.env['TRIGGER_PROJECT_REF']?.trim();
if (!project) throw new Error('缺少环境变量 TRIGGER_PROJECT_REF（自建 Trigger.dev 实例里的项目 ref）');

/** 与 vitest.node.config.mts 的插件一致：智能体定义的 Markdown 作为字符串打包。 */
const markdownAsText = esbuildPlugin({
  name: 'md-as-text',
  setup(build) {
    build.onLoad({ filter: /\.md$/ }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
  }
});

export default defineConfig({
  project,
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 3600,
  dirs: ['./agent'],
  build: { extensions: [markdownAsText] }
});
