import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planTestCommands } from './run-test-lane.mjs';

const graph = {
  graph: {
    nodes: {
      angular: { data: { targets: { test: { executor: '@angular/build:unit-test' } } } },
      angularNx: { data: { targets: { test: { executor: '@nx/angular:unit-test' } } } },
      vitest: {
        data: { targets: { test: { executor: '@nx/vitest:test' }, 'test-memory': { executor: 'nx:run-commands' } } }
      },
      commands: { data: { targets: { test: { executor: 'nx:run-commands' } } } }
    }
  }
};

const plan = (projects, options = {}) =>
  planTestCommands(graph, { projects, target: 'test', coverage: true, ...options });
const flags = command => command.filter(arg => arg.startsWith('--coverage'));
const projects = command => command[command.indexOf('-p') + 1].split(',');

test('Vitest 项目保留现有覆盖率参数与串行调度', () => {
  const [command] = plan(['vitest', 'commands']);
  assert.deepEqual(flags(command), [
    '--coverage',
    '--coverage.reporter=json',
    '--coverage.reporter=json-summary',
    '--coverage.reporter=lcovonly'
  ]);
  assert.ok(command.includes('--parallel=1'));
  assert.deepEqual(projects(command), ['commands', 'vitest']);
});

test('Angular 官方执行器的 coverage 保持布尔值，reporters 使用独立数组参数', () => {
  const [command] = plan(['angular', 'angularNx']);
  assert.deepEqual(flags(command), [
    '--coverage',
    '--coverageReporters=json',
    '--coverageReporters=json-summary',
    '--coverageReporters=lcovonly'
  ]);
  assert.deepEqual(projects(command), ['angular', 'angularNx']);
});

test('混合 lane 按执行器协议分组，每个项目只执行一次', () => {
  const commands = plan(['vitest', 'angular', 'commands', 'angularNx', 'angular']);
  assert.equal(commands.length, 2);
  assert.deepEqual(commands.flatMap(projects).sort(), ['angular', 'angularNx', 'commands', 'vitest']);
  assert.deepEqual(commands, plan(['angularNx', 'commands', 'angular', 'vitest']));
});

test('不采集覆盖率时保留一个串行批次，内存测试不会被重新打开插桩', () => {
  const [mixed] = plan(['angular', 'vitest'], { coverage: false });
  assert.deepEqual(flags(mixed), []);
  assert.deepEqual(projects(mixed), ['angular', 'vitest']);
  const [memory] = plan(['vitest'], { coverage: false, target: 'test-memory' });
  assert.deepEqual(flags(memory), []);
  assert.equal(memory[memory.indexOf('-t') + 1], 'test-memory');
});

test('错误的项目图、项目名或 target 明确失败，不能漏测后转绿', () => {
  assert.throws(() => planTestCommands({}, { projects: ['angular'], target: 'test', coverage: true }), /graph.nodes/);
  assert.throws(() => plan(['missing']), /missing:test/);
  assert.throws(() => plan(['angular'], { target: 'test-memory' }), /angular:test-memory/);
});
