import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { productRoot } from '../supabase/supabase-local.mjs';

const defaults = {
  devVarsFile: resolve(productRoot, 'apps/api/.dev.vars'),
  agentEnvFile: resolve(productRoot, 'apps/agent/.env.agent')
};
const ENVIRONMENT_KEY = /^tr_(dev|prod|stg|preview)_[A-Za-z0-9]+$/;
const PROJECT_REF = /^proj_[a-z0-9]+$/;
const ENVIRONMENT_NAMES = { prod: '生产环境', stg: '预发环境', preview: '预览环境' };

async function readOptional(file) {
  return readFile(file, 'utf8').catch(error => (error.code === 'ENOENT' ? '' : Promise.reject(error)));
}

function instanceUrl(value) {
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || !['http:', 'https:'].includes(url.protocol))
    throw new Error(`apps/api/.dev.vars 的 TRIGGER_API_URL 不是 http(s) 地址：${value}`);
  return value.replace(/\/+$/, '');
}

const MISSING_AGENT_ENV =
  '开发环境密钥要启动智能体开发会话：先把 apps/agent/.env.agent.example 复制为 .env.agent，填写模型密钥。';

async function requireAgentEnvFile(file) {
  await access(file).catch(cause => {
    throw new Error(MISSING_AGENT_ENV, { cause });
  });
}

/**
 * 按 `apps/api/.dev.vars` 里的 Trigger.dev 配置决定本地开发怎么接智能体。
 *
 * - 两项都没配：`disabled`，设计器禁用 AI 入口。
 * - 开发环境密钥（`tr_dev_`）：`dev`，`nx dev` 顺带启动 `trigger dev`；需要 `TRIGGER_PROJECT_REF` 与 `apps/agent/.env.agent`。
 * - 其他环境密钥：`deployed`，会话交给实例上已部署的智能体。
 *
 * 配置不完整或无效时直接报错，不当作未配置处理。
 */
export async function agentEnvironment({
  devVarsFile = defaults.devVarsFile,
  agentEnvFile = defaults.agentEnvFile,
  env = process.env
} = {}) {
  const vars = parseEnv(await readOptional(devVarsFile));
  const apiUrl = vars.TRIGGER_API_URL?.trim();
  const secretKey = vars.TRIGGER_SECRET_KEY?.trim();
  if (!apiUrl && !secretKey) return { mode: 'disabled' };
  if (!apiUrl || !secretKey)
    throw new Error('apps/api/.dev.vars 里 TRIGGER_API_URL 与 TRIGGER_SECRET_KEY 要一起配置；不用 AI 时两项都删掉。');
  const environment = ENVIRONMENT_KEY.exec(secretKey)?.[1];
  if (!environment)
    throw new Error(
      'apps/api/.dev.vars 的 TRIGGER_SECRET_KEY 不是 Trigger.dev 环境密钥：应以 tr_dev_、tr_prod_、tr_stg_ 或 tr_preview_ 开头。'
    );
  const agent = {
    mode: environment === 'dev' ? 'dev' : 'deployed',
    environment,
    apiUrl: instanceUrl(apiUrl),
    secretKey
  };
  if (agent.mode === 'deployed') return agent;
  const projectRef = env.TRIGGER_PROJECT_REF?.trim() ?? '';
  if (!PROJECT_REF.test(projectRef))
    throw new Error(
      '开发环境密钥要启动智能体开发会话：先 export TRIGGER_PROJECT_REF=proj_…（实例控制台里的项目 ref）。'
    );
  await requireAgentEnvFile(agentEnvFile);
  return { ...agent, projectRef };
}

/** 导航页与终端里展示的接入状态，不含密钥。 */
export function agentSummary(agent) {
  if (agent.mode === 'dev')
    return {
      label: '开发会话',
      note: 'nx dev 已在 dev-agent 任务里启动 trigger dev，会话跑在实例的 Development 环境；改了智能体代码即时生效。'
    };
  if (agent.mode === 'deployed')
    return {
      label: `已部署版本 · ${ENVIRONMENT_NAMES[agent.environment]}`,
      note: '会话交给实例上已部署的 model-designer；改了智能体代码要重新部署（aiao-model-design-agent:deploy）。'
    };
  return {
    label: '未启用',
    note: '在 apps/api/.dev.vars 填写 TRIGGER_API_URL 与 TRIGGER_SECRET_KEY 后重启：开发环境密钥（tr_dev_）会顺带启动 trigger dev，其他环境密钥使用实例上已部署的智能体。'
  };
}
