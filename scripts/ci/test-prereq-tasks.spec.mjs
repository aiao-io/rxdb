import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { prereqTargets } from './test-prereq-tasks.mjs';

const cliPath = fileURLToPath(new URL('./test-prereq-tasks.mjs', import.meta.url));

/** `nx run-many --graph=<file>` 写出的任务图形状：只用到 `tasks.tasks[*].target`。 */
const taskGraph = ids => ({
  tasks: {
    tasks: Object.fromEntries(
      ids.map(id => {
        const [project, target, configuration] = id.split(':');
        return [id, { id, target: { project, target, ...(configuration ? { configuration } : {}) } }];
      })
    )
  }
});

test('按 target 分组，排除测试 target 本身，build 排在最前', () => {
  const graph = taskGraph([
    'a:test',
    'b:test',
    'b:spec-typecheck',
    'c:build',
    'd:build',
    'a:typecheck',
    'e:test-memory'
  ]);

  assert.deepEqual(prereqTargets(graph), [
    { target: 'build', projects: ['c', 'd'] },
    { target: 'spec-typecheck', projects: ['b'] },
    { target: 'typecheck', projects: ['a'] }
  ]);
});

test('带 configuration 的任务按 target 归组 —— run-many -t build 走默认配置', () => {
  const graph = taskGraph(['x:test', 'lib:build:production', 'pkg:build']);

  assert.deepEqual(prereqTargets(graph), [{ target: 'build', projects: ['lib', 'pkg'] }]);
});

test('测试依赖的 test-* 任务也留给串行那一步 —— 测试环境（test-env）与真实用例（test-node）都不是构建', () => {
  const graph = taskGraph(['supabase:test', 'supabase:test-env', 'pglite:test', 'pglite:test-node', 'core:build']);

  assert.deepEqual(prereqTargets(graph), [{ target: 'build', projects: ['core'] }]);
});

test('只是以 test 开头的非测试 target 不受影响', () => {
  const graph = taskGraph(['a:test', 'a:testbed-build']);

  assert.deepEqual(prereqTargets(graph), [{ target: 'testbed-build', projects: ['a'] }]);
});

test('只有测试任务时没有前置任务', () => {
  assert.deepEqual(prereqTargets(taskGraph(['a:test', 'b:test'])), []);
});

test('任务图形状不对时直接失败 —— 不能静默跳过预构建、把串行构建留给测试那一步', () => {
  assert.throws(() => prereqTargets({ graph: {} }), /tasks\.tasks/);
});

test('CLI：每行一个「target<TAB>逗号分隔的项目」', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prereq-'));
  const file = join(dir, 'graph.json');
  writeFileSync(file, JSON.stringify(taskGraph(['a:test', 'c:build', 'b:build', 'a:typecheck'])));

  const result = spawnSync(process.execPath, [cliPath, file], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'build\tb,c\ntypecheck\ta\n');
});

test('CLI：缺任务图参数时给出用法并失败', () => {
  const result = spawnSync(process.execPath, [cliPath], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /用法/);
});
