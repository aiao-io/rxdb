import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { appPort, dashboardPort } from './endpoints.mjs';

const project = JSON.parse(await readFile(new URL('../../project.json', import.meta.url), 'utf8'));
const { targets } = project;
const supervisor = 'node apps/dev-rxdb-supabase/scripts/dev/supervise.mjs ';

const longRunning = projectTargets =>
  Object.entries(projectTargets).filter(([name, target]) => name.startsWith('dev') && target.continuous);

const unsupervised = projectTargets =>
  longRunning(projectTargets)
    .filter(([, target]) => !target.options.command.startsWith(supervisor))
    .map(([name]) => name);

test('dev 链上每个常驻进程都经 supervise 启动，Nx 被强杀也不留孤儿占住固定端口', () => {
  assert.deepEqual(
    longRunning(targets).map(([name]) => name),
    ['dev', 'dev-serve', 'dev-dashboard', 'dev-logs']
  );
  assert.deepEqual(unsupervised(targets), []);
});

test('绕过 supervise 的常驻命令会被查出来', () => {
  const projectTargets = {
    dev: { continuous: true, options: { command: `${supervisor}node open.mjs` } },
    'dev-logs': { continuous: true, options: { command: 'docker compose logs -f' } },
    'dev-ports': { options: { command: 'node check-ports.mjs' } }
  };
  assert.deepEqual(unsupervised(projectTargets), ['dev-logs']);
});

test('测试起始页要等应用和起始页都就绪才打开', () => {
  const ready = targets.dev.dependsOn.filter(dependency => dependency.waitFor === 'ready');
  assert.deepEqual(ready.map(dependency => dependency.target).sort(), ['dev-dashboard', 'dev-serve']);
});

test('就绪探测、端口检查与 serve 配置用的是同一组固定端口', () => {
  assert.equal(targets.serve.options.port, appPort);
  assert.equal(targets['dev-serve'].readyWhen.url, `http://127.0.0.1:${appPort}/`);
  assert.equal(targets['dev-dashboard'].readyWhen.url, `http://127.0.0.1:${dashboardPort}/`);
  for (const name of ['dev-serve', 'dev-dashboard']) assert.ok(targets[name].dependsOn.includes('dev-ports'), name);
});
