import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { agentEnvironment, agentSummary } from './agent-environment.mjs';

const PROD_KEY = 'tr_prod_0123456789abcdefghij';
const DEV_KEY = 'tr_dev_0123456789abcdefghij';
const PROJECT_REF = 'proj_xjkrazglzqhfhhbwdllb';

/** 在临时目录里放 api 的 .dev.vars 与 agent 的 .env.agent；传 undefined 表示文件不存在。 */
async function fixture(t, { devVars, agentEnv }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-agent-env-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const devVarsFile = path.join(root, '.dev.vars');
  const agentEnvFile = path.join(root, '.env.agent');
  if (devVars !== undefined) await writeFile(devVarsFile, devVars);
  if (agentEnv !== undefined) await writeFile(agentEnvFile, agentEnv);
  return { devVarsFile, agentEnvFile };
}

function trigger(apiUrl, secretKey) {
  return `SUPABASE_URL="https://remote.supabase.co"\nTRIGGER_API_URL="${apiUrl}"\nTRIGGER_SECRET_KEY="${secretKey}"\n`;
}

test('没有 .dev.vars 或其中没有 Trigger.dev 配置时不启用 AI', async t => {
  assert.deepEqual(await agentEnvironment({ ...(await fixture(t, {})), env: {} }), { mode: 'disabled' });
  const onlyAuth = await fixture(t, { devVars: 'SUPABASE_URL="https://remote.supabase.co"\nDEEPSEEK_MODEL="x"\n' });
  assert.deepEqual(await agentEnvironment({ ...onlyAuth, env: {} }), { mode: 'disabled' });
});

test('生产、预发与预览环境的密钥使用实例上已部署的智能体', async t => {
  for (const [secretKey, environment] of [
    [PROD_KEY, 'prod'],
    ['tr_stg_0123456789abcdefghij', 'stg'],
    ['tr_preview_0123456789abcdefghij', 'preview']
  ]) {
    const paths = await fixture(t, { devVars: trigger('http://localhost:8030/', secretKey) });
    assert.deepEqual(await agentEnvironment({ ...paths, env: {} }), {
      mode: 'deployed',
      environment,
      apiUrl: 'http://localhost:8030',
      secretKey
    });
  }
});

test('开发环境密钥要启动智能体开发会话，需要项目 ref 与 .env.agent', async t => {
  const ready = await fixture(t, {
    devVars: trigger('https://trigger.example.com', DEV_KEY),
    agentEnv: 'AGENT_MODEL=x'
  });
  assert.deepEqual(await agentEnvironment({ ...ready, env: { TRIGGER_PROJECT_REF: PROJECT_REF } }), {
    mode: 'dev',
    environment: 'dev',
    apiUrl: 'https://trigger.example.com',
    secretKey: DEV_KEY,
    projectRef: PROJECT_REF
  });
  await assert.rejects(agentEnvironment({ ...ready, env: {} }), /TRIGGER_PROJECT_REF/);
  await assert.rejects(
    agentEnvironment({ ...ready, env: { TRIGGER_PROJECT_REF: 'my-project' } }),
    /TRIGGER_PROJECT_REF/
  );
  const withoutAgentEnv = await fixture(t, { devVars: trigger('https://trigger.example.com', DEV_KEY) });
  await assert.rejects(
    agentEnvironment({ ...withoutAgentEnv, env: { TRIGGER_PROJECT_REF: PROJECT_REF } }),
    /\.env\.agent/
  );
});

test('只配了一半、地址无效或密钥不是环境密钥时直接报错', async t => {
  const half = await fixture(t, { devVars: 'TRIGGER_API_URL="http://localhost:8030"\n' });
  await assert.rejects(agentEnvironment({ ...half, env: {} }), /TRIGGER_SECRET_KEY/);
  const badUrl = await fixture(t, { devVars: trigger('localhost:8030', PROD_KEY) });
  await assert.rejects(agentEnvironment({ ...badUrl, env: {} }), /TRIGGER_API_URL/);
  const placeholder = await fixture(t, {
    devVars: trigger('https://trigger.example.com', 'replace-with-environment-secret-key')
  });
  await assert.rejects(agentEnvironment({ ...placeholder, env: {} }), /tr_dev_/);
});

test('状态说明不带密钥', () => {
  const agents = [
    { mode: 'disabled' },
    { mode: 'deployed', environment: 'prod', apiUrl: 'http://localhost:8030', secretKey: PROD_KEY },
    { mode: 'dev', environment: 'dev', apiUrl: 'http://localhost:8030', secretKey: DEV_KEY, projectRef: PROJECT_REF }
  ];
  const labels = new Set();
  for (const agent of agents) {
    const summary = agentSummary(agent);
    assert.ok(summary.label && summary.note);
    for (const secret of [PROD_KEY, DEV_KEY]) assert.ok(!JSON.stringify(summary).includes(secret), summary.note);
    labels.add(summary.label);
  }
  assert.equal(labels.size, agents.length);
  assert.match(agentSummary(agents[0]).note, /apps\/api\/\.dev\.vars/);
});
