// nx dev 的智能体任务：开发环境密钥时运行 trigger dev，其余情况只报告接入状态并保持运行。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productRoot } from '../supabase/supabase-local.mjs';
import { agentEnvironment, agentSummary } from './agent-environment.mjs';
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
 * CLI 用 README 约定的 `self-hosted` 登录配置（环境里有 `TRIGGER_ACCESS_TOKEN` 时 CLI 优先用它），
 * 连 Worker 用的同一个实例；跳过升级检查与安装向导，免得在 Nx 的任务窗格里停下来等输入或改依赖。
 */
export function agentDevPlan(agent, cli, env = process.env) {
  if (agent.mode !== 'dev') return null;
  return {
    command: process.execPath,
    args: [
      cli,
      'dev',
      'start',
      '--env-file',
      '.env.agent',
      '--profile',
      'self-hosted',
      '--api-url',
      agent.apiUrl,
      '--skip-update-check',
      '--skip-mcp-install',
      '--skip-rules-install'
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
  const agent = await agentEnvironment();
  const { label, note } = agentSummary(agent);
  console.log(`AI 智能体：${label}。${note}`);
  const plan = agentDevPlan(agent, agent.mode === 'dev' ? triggerCli() : null);
  if (!plan) return keepRunning();
  const code = await runAgentSession(plan);
  if (code !== 0)
    console.error(
      `trigger dev 退出（${code}）。没登录这个实例时先运行 pnpm --dir aiao-model-design/apps/agent exec trigger login --api-url ${agent.apiUrl} --profile self-hosted，或在环境里提供 TRIGGER_ACCESS_TOKEN。`
    );
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
