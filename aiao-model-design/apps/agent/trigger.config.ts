import { esbuildPlugin } from '@trigger.dev/build/extensions';
import { defineConfig } from '@trigger.dev/sdk';
import { readFile } from 'node:fs/promises';

/**
 * 项目 ref 随自建实例而变，不写进仓库：trigger CLI 读环境变量 `TRIGGER_PROJECT_REF`（shell 或 `--env-file`）
 * 或 `--project-ref`，覆盖这里的占位值。不能在这里读 `process.env` 再抛错：部署镜像里的索引与运行进程
 * 也会加载本文件，而它们只拿到实例上配置的环境变量。没设置时 CLI 会报找不到这个占位项目。
 */
const project = 'proj_set_TRIGGER_PROJECT_REF';

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
  dirs: ['./src'],
  build: { extensions: [markdownAsText] }
});
