/**
 * scripts/clean.mjs
 *
 * 一键清盘：递归删除构建产物与缓存目录。
 *
 * 会清理的路径（相对仓库根）：
 *   - dist / tmp                            # 各包构建产物 + 临时目录
 *   - coverage                              # Vitest/Istanbul 覆盖率产物
 *   - website/build / website/.docusaurus   # Docusaurus 构建产物
 *   - benchmarks/dist                       # benchmarks 站点构建产物
 *   - node_modules/.cache                   # 各工具链缓存
 *
 * 用法：pnpm clean
 * 注意：会清掉本地最新一次覆盖率结果，跑之前确认没有未保存报告。
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// 待清理目录列表（相对 cwd）。cwd 默认是仓库根，由 package.json#clean 触发时保证。
const directories = [
  'dist',
  'tmp',
  'coverage',
  'website/build',
  'website/.docusaurus',
  'benchmarks/dist',
  'node_modules/.cache'
];

// 并发删除：彼此独立，无顺序依赖。force: true 让目录不存在时也不报错。
await Promise.all(directories.map(directory => rm(resolve(directory), { recursive: true, force: true })));
