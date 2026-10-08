/**
 * scripts/ci/test-prereq-tasks.mjs
 *
 * 从 `nx run-many -t test -p <lane 的项目> --graph=<file>` 导出的任务图里，取出测试任务之外的
 * 前置任务（`^build`、`typecheck`、`spec-typecheck`…），按 target 分组输出，供 CI 的 test lane
 * 在跑测试之前以 `--parallel=3` 先把它们建完。
 *
 * 为什么需要它：
 *   test lane 以 `--parallel=1` 串行跑测试（各 vitest 任务自己已经多 worker 并行，再叠一层 Nx 并行
 *   会在 4 vCPU 上互相抢核）。但 `--parallel` 管的是整张任务图，测试依赖的那批构建也跟着串行：
 *   PR #101 上最重的一条 lane 光建依赖就花了 301s，而 build job 用 `--parallel=3` 建同一批包。
 *   先单独并行跑完前置任务，测试那一步就全部命中本地缓存。
 *
 * 用法：
 *   node scripts/ci/test-prereq-tasks.mjs <task-graph.json> --exclude=test[,test-memory]
 *   → 每行一个 `<target>\t<逗号分隔的项目>`，build 排在最前
 *
 * 带 configuration 的任务（Angular 库的 `build:production`）按 target 归组：`run-many -t build`
 * 走 defaultConfiguration，与 `^build` 解析到的是同一个任务。万一某个依赖用的不是默认配置，
 * 预构建建的是另一个任务，测试那一步仍会串行补建它 —— 只会慢，不会错。
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * 按 target 分组的前置任务。
 *
 * @param {{ tasks?: { tasks?: Record<string, { target: { project: string, target: string } }> } }} graph
 *   `nx run-many --graph=<file>` 写出的 JSON
 * @param {string[]} excludeTargets 测试 target 本身（它们留给串行那一步跑）
 * @returns {{ target: string, projects: string[] }[]} build 在最前，其余按 target 名排序；项目去重、排序
 * @throws {Error} 任务图里没有 `tasks.tasks`：形状不对时宁可失败，也不静默跳过预构建
 */
export function prereqTargets(graph, excludeTargets) {
  const tasks = graph?.tasks?.tasks;
  if (tasks === undefined || tasks === null || typeof tasks !== 'object') {
    throw new Error('任务图缺少 tasks.tasks：确认它来自 `nx run-many ... --graph=<file>`');
  }

  const byTarget = new Map();
  for (const { target } of Object.values(tasks)) {
    if (excludeTargets.includes(target.target)) continue;
    const projects = byTarget.get(target.target) ?? new Set();
    projects.add(target.project);
    byTarget.set(target.target, projects);
  }

  const rank = target => (target === 'build' ? 0 : 1);
  return [...byTarget.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([target, projects]) => ({ target, projects: [...projects].sort() }));
}

const main = argv => {
  const file = argv.find(arg => !arg.startsWith('--'));
  const exclude = argv.find(arg => arg.startsWith('--exclude='))?.slice('--exclude='.length);
  if (file === undefined || exclude === undefined || exclude === '') {
    console.error('用法: node scripts/ci/test-prereq-tasks.mjs <task-graph.json> --exclude=test[,test-memory]');
    process.exit(1);
  }

  const graph = JSON.parse(readFileSync(file, 'utf8'));
  for (const { target, projects } of prereqTargets(graph, exclude.split(','))) {
    process.stdout.write(`${target}\t${projects.join(',')}\n`);
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
