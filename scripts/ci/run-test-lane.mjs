import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const reporters = ['json', 'json-summary', 'lcovonly'];

/** 从任务图生成串行测试命令，覆盖率参数遵循各执行器的协议。 */
export function planTestCommands(graph, { projects, target, coverage }) {
  const nodes = graph?.graph?.nodes;
  if (!nodes || typeof nodes !== 'object') throw new Error('任务图缺少 graph.nodes');
  const groups = new Map();
  for (const project of [...new Set(projects)].sort()) {
    const config = nodes[project]?.data?.targets?.[target];
    if (!config) throw new Error(`任务图缺少 ${project}:${target}`);
    const angular = ['@angular/build:unit-test', '@nx/angular:unit-test'].includes(config.executor);
    const option = angular ? 'coverageReporters' : 'coverage.reporter';
    const flags = coverage ? ['--coverage', ...reporters.map(reporter => `--${option}=${reporter}`)] : [];
    const key = JSON.stringify(flags);
    const group = groups.get(key) ?? { projects: [], flags };
    group.projects.push(project);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => [
    'exec',
    'nx',
    'run-many',
    '-t',
    target,
    '-p',
    group.projects.join(','),
    '--output-style=stream',
    '--parallel=1',
    ...group.flags
  ]);
}

if (import.meta.main) {
  const [file, target, projects, coverage] = process.argv.slice(2);
  if (!file || !target || projects === undefined || !['true', 'false'].includes(coverage)) {
    throw new Error('用法: run-test-lane.mjs <task-graph.json> <target> <projects> <true|false>');
  }
  const commands = planTestCommands(JSON.parse(readFileSync(file, 'utf8')), {
    projects: projects.split(','),
    target,
    coverage: coverage === 'true'
  });
  let status = 0;
  for (const command of commands) {
    const result = spawnSync('pnpm', command, { stdio: 'inherit' });
    if (result.error) throw result.error;
    status ||= result.status ?? 1;
  }
  process.exitCode = status;
}
