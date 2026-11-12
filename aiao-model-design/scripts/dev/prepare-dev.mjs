// nx dev 的准备步骤：在本机 Supabase 上准备测试账号，生成本地 Worker 的配置、密钥与开发导航页。
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEnvironment, productRoot } from '../supabase/supabase-local.mjs';
import { agentEnvironment, agentSummary } from './agent-environment.mjs';
import { developmentAccounts, seedDevelopmentAccounts } from './seed-accounts.mjs';
import { dashboardUrl, services, webUrl, workerUrl } from './services.mjs';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 把模板里的 `{{ NAME }}` 换成 HTML 转义后的取值；模板用到没提供的取值时报错。 */
export function renderDashboard(template, values) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`开发导航模板缺少取值：${name}`);
    return String(values[name]).replace(/[&<>"']/g, char => ENTITIES[char]);
  });
}

function dashboardValues({ local, agent }) {
  const [designer, reviewer] = developmentAccounts;
  const { label, note } = agentSummary(agent);
  const enabled = agent.mode !== 'disabled';
  return {
    DESIGNER_URL: `${webUrl}/model-designer/canvas`,
    LOGIN_URL: `${webUrl}/login.html`,
    WEB_ADDRESS: `${services.web.host}:${services.web.port}`,
    WEB_PORT: services.web.port,
    WORKER_ADDRESS: `${services.worker.host}:${services.worker.port}`,
    WORKER_PORT: services.worker.port,
    SUPABASE_URL: local.url,
    SUPABASE_PORT: local.env.API_PORT,
    DB_ADDRESS: `127.0.0.1:${local.env.DB_PORT}`,
    DB_PASSWORD: local.env.POSTGRES_PASSWORD,
    DB_URL: local.databaseUrl,
    DESIGNER_EMAIL: designer.email,
    DESIGNER_PASSWORD: designer.password,
    REVIEWER_EMAIL: reviewer.email,
    REVIEWER_PASSWORD: reviewer.password,
    AGENT_MODE: agent.mode,
    AGENT_LABEL: label,
    AGENT_NOTE: note,
    AGENT_URL: enabled ? agent.apiUrl : '#agent-title',
    AGENT_TARGET: enabled ? '_blank' : '_self',
    AGENT_URL_TEXT: enabled ? agent.apiUrl : '未配置'
  };
}

async function writePrivate(file, content) {
  await writeFile(file, content, { mode: 0o600 });
  await chmod(file, 0o600);
}

/**
 * 生成本地 Worker 的配置、密钥与导航页，都写在忽略的 `apps/api/.wrangler/local-dev/` 下，
 * 不改 `apps/api/.dev.vars` 与 `wrangler.jsonc`。本地 Worker 在根路径提供导航页，不需要先构建 web。
 *
 * @param root 产品根目录
 * @param options.local `localEnvironment()` 的结果
 * @param options.agent `agentEnvironment()` 的结果；未启用时 Worker 拿不到 Trigger.dev 配置
 */
export async function writeDevelopmentConfig(root, { local, agent }) {
  const api = resolve(root, 'apps/api');
  const directory = resolve(api, '.wrangler/local-dev');
  const assets = resolve(directory, 'assets');
  const config = JSON.parse(await readFile(resolve(api, 'wrangler.jsonc'), 'utf8'));
  delete config.$schema;
  config.main = resolve(api, config.main);
  config.assets = { ...config.assets, directory: assets, html_handling: 'auto-trailing-slash', not_found_handling: 'none' };
  await mkdir(assets, { recursive: true });
  const template = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
  await writePrivate(resolve(assets, 'index.html'), renderDashboard(template, dashboardValues({ local, agent })));
  await writeFile(resolve(assets, '_headers'), '/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n');
  await writeFile(resolve(directory, 'wrangler.json'), `${JSON.stringify(config, null, 2)}\n`);
  const secrets = { SUPABASE_URL: local.url, SUPABASE_ANON_KEY: local.env.ANON_KEY };
  if (agent.mode !== 'disabled') Object.assign(secrets, { TRIGGER_API_URL: agent.apiUrl, TRIGGER_SECRET_KEY: agent.secretKey });
  const lines = Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`);
  await writePrivate(resolve(directory, '.dev.vars'), `${lines.join('\n')}\n`);
}

async function main() {
  const local = await localEnvironment();
  const agent = await agentEnvironment();
  await seedDevelopmentAccounts(local);
  await writeDevelopmentConfig(productRoot, { local, agent });
  console.log(`本地开发配置已准备：开发导航 ${dashboardUrl}`);
  console.log(
    `Web ${webUrl} · Worker ${workerUrl} · Supabase Auth ${local.url}/auth/v1 · AI 智能体：${agentSummary(agent).label}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
