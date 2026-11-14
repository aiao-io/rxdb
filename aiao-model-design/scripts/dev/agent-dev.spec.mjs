import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { agentDevPlan, agentDirectory, runAgentSession, triggerCli } from './agent-dev.mjs';

const devAgent = {
  mode: 'dev',
  environment: 'dev',
  apiUrl: 'http://localhost:8030',
  secretKey: 'tr_dev_0123456789abcdefghij',
  projectRef: 'proj_xjkrazglzqhfhhbwdllb'
};

test('开发环境密钥启动 trigger dev：连 Worker 用的同一个实例，跳过升级检查与安装向导', () => {
  const plan = agentDevPlan(devAgent, '/cli/trigger.js', { PATH: '/usr/bin' });
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [
    '/cli/trigger.js',
    'dev',
    'start',
    '--env-file',
    '.env.agent',
    '--profile',
    'self-hosted',
    '--api-url',
    devAgent.apiUrl,
    '--skip-update-check',
    '--skip-mcp-install',
    '--skip-rules-install'
  ]);
  assert.equal(plan.cwd, agentDirectory);
  assert.deepEqual(plan.env, {
    PATH: '/usr/bin',
    TRIGGER_API_URL: devAgent.apiUrl,
    TRIGGER_PROJECT_REF: devAgent.projectRef
  });
});

test('trigger CLI 按 agent 包自己的依赖解析到入口脚本', async () => {
  const cli = triggerCli();
  assert.ok(path.isAbsolute(cli));
  assert.match(cli, /trigger\.dev[\\/]dist[\\/]/);
  await access(cli);
});

test('未启用与已部署时不启动开发会话', () => {
  assert.equal(agentDevPlan({ mode: 'disabled' }, '/cli/trigger.js', {}), null);
  const deployed = { ...devAgent, mode: 'deployed', environment: 'prod', secretKey: 'tr_prod_0123456789abcdefghij' };
  assert.equal(agentDevPlan(deployed, '/cli/trigger.js', {}), null);
});

function fakeChild() {
  const child = new EventEmitter();
  child.signals = [];
  child.kill = signal => child.signals.push(signal);
  return child;
}

test('开发会话的退出码原样返回，收到停止信号时转给它', async () => {
  const signals = new EventEmitter();
  const child = fakeChild();
  const spawned = [];
  const plan = agentDevPlan(devAgent, '/cli/trigger.js', {});
  const exit = runAgentSession(plan, {
    spawn: (...args) => {
      spawned.push(args);
      return child;
    },
    signals
  });
  assert.deepEqual(spawned, [[plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: 'inherit' }]]);
  signals.emit('SIGINT');
  assert.deepEqual(child.signals, ['SIGINT']);
  child.emit('exit', 1, null);
  assert.equal(await exit, 1);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('开发会话进程起不来时报错', async () => {
  const child = fakeChild();
  const exit = runAgentSession(agentDevPlan(devAgent, '/cli/trigger.js', {}), {
    spawn: () => child,
    signals: new EventEmitter()
  });
  child.emit('error', new Error('spawn ENOENT'));
  await assert.rejects(exit, /ENOENT/);
});
