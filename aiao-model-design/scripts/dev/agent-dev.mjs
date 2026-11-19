// nx dev 的智能体任务：开发环境密钥时运行 trigger dev，其余情况只报告接入状态并保持运行。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productRoot } from '../supabase/supabase-local.mjs';
import { agentEnvironment, agentSummary } from './agent-environment.mjs';
import { recoverLocalAgentConfig } from './local-agent-config.mjs';
import { keepRunning } from './keep-running.mjs';

/** 智能体应用目录，`trigger dev` 在这里读取 trigger.config.ts 与 .env.agent。 */
export const agentDirectory = resolve(productRoot, 'apps/agent');

/** trigger CLI 的入口脚本：按 agent 包自己的依赖解析，不依赖 PATH 或 pnpm 的 shim。 */
export function triggerCli() {
  const require = createRequire(resolve(agentDirectory, 'package.json'));
  const manifest = require.resolve('trigger.dev/package.json');
  return resolve(dirname(manifest), require(manifest).bin.trigger);
}

/**
 * 开发环境密钥时启动 `trigger dev` 的命令，其余模式返回 null。
 *
 * CLI 默认用 README 约定的 `self-hosted` 登录配置，也可用 `TRIGGER_PROFILE` 选择已登录 profile；
 * 环境里有 `TRIGGER_ACCESS_TOKEN` 时 CLI 优先用它，
 * 连 Worker 用的同一个实例；跳过升级检查，避免在 Nx 的任务窗格里等待。
 */
export function agentDevPlan(agent, cli, env = process.env) {
  if (agent.mode !== 'dev') return null;
  const profile = env.TRIGGER_PROFILE?.trim() || 'self-hosted';
  return {
    command: process.execPath,
    args: [
      cli,
      'dev',
      'start',
      '--env-file',
      '.env.agent',
      '--profile',
      profile,
      '--api-url',
      agent.apiUrl,
      '--project-ref',
      agent.projectRef,
      '--skip-update-check'
    ],
    cwd: agentDirectory,
    env: { ...env, TRIGGER_API_URL: agent.apiUrl, TRIGGER_PROJECT_REF: agent.projectRef }
  };
}

/** 运行开发会话，把停止信号转给它；返回它的退出码，起不来时报错。 */
export function runAgentSession(plan, { spawn: start = spawn, signals = process } = {}) {
  return new Promise((resolveExit, reject) => {
    const child = start(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: 'inherit' });
    const listeners = { SIGINT: () => child.kill('SIGINT'), SIGTERM: () => child.kill('SIGTERM') };
    const release = () => {
      for (const [signal, listener] of Object.entries(listeners)) signals.off(signal, listener);
    };
    for (const [signal, listener] of Object.entries(listeners)) signals.on(signal, listener);
    child.once('error', error => {
      release();
      reject(error);
    });
    child.once('exit', code => {
      release();
      resolveExit(code ?? 1);
    });
  });
}

async function main() {
  const recovery = await recoverLocalAgentConfig();
  if (recovery.status === 'recovered') console.log('已从本地 Trigger.dev 恢复 Development key 与项目 ref。');
  if (recovery.status === 'not-found') console.log('本地 Trigger.dev 没有可恢复的 Development key；首次使用需先创建项目并签发 key。');
  if (recovery.status === 'unavailable') console.log('无法查询本地 Trigger.dev 的 Development key；检查本地 Docker/Trigger 服务状态。');
  const agent = await agentEnvironment();
  const { label, note } = agentSummary(agent);
  console.log(`AI 智能体：${label}。${note}`);
  const plan = agentDevPlan(agent, agent.mode === 'dev' ? triggerCli() : null);
  if (!plan) return keepRunning();
  const code = await runAgentSession(plan);
  if (code !== 0)
    console.error(
      `trigger dev 退出（${code}），原因见上方 CLI 的输出。如果是没登录这个实例：先运行 pnpm --dir aiao-model-design/apps/agent exec trigger login --api-url ${agent.apiUrl} --profile self-hosted，或在环境里提供 TRIGGER_ACCESS_TOKEN。`
    );
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
