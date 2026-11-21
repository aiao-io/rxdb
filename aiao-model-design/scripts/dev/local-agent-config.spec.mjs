import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { recoverLocalAgentConfig } from './local-agent-config.mjs';

const key = 'tr_dev_sk_0123456789abcdefghij';
const projectRef = 'proj_xjkrazglzqhfhhbwdllb';

async function fixture(t, { vars, triggerEnv } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-agent-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const devVarsFile = path.join(root, 'apps/api/.dev.vars');
  const triggerEnvFile = path.join(root, 'infra/trigger/.env');
  await Promise.all([
    mkdir(path.dirname(devVarsFile), { recursive: true }),
    mkdir(path.dirname(triggerEnvFile), { recursive: true })
  ]);
  if (vars !== undefined) await writeFile(devVarsFile, vars);
  if (triggerEnv !== undefined) await writeFile(triggerEnvFile, triggerEnv);
  return { devVarsFile, triggerEnvFile };
}

test('从本地 Development runtime 恢复 key 和项目 ref，并写入私有配置', async t => {
  const files = await fixture(t, { vars: 'SUPABASE_URL="https://example.supabase.co"\n' });
  const result = await recoverLocalAgentConfig({
    ...files,
    findCredentials: async () => [{ secretKey: key, projectRef }]
  });

  assert.equal(result.status, 'recovered');
  assert.equal(
    await readFile(files.devVarsFile, 'utf8'),
    `SUPABASE_URL="https://example.supabase.co"\nTRIGGER_API_URL="http://127.0.0.1:8030"\nTRIGGER_SECRET_KEY="${key}"\n`
  );
  assert.equal(await readFile(files.triggerEnvFile, 'utf8'), `TRIGGER_PROJECT_REF="${projectRef}"\n`);
  assert.equal((await stat(files.devVarsFile)).mode & 0o777, 0o600);
  assert.equal((await stat(files.triggerEnvFile)).mode & 0o777, 0o600);
});

test('恢复时更新 .dev.vars 中所有重复的本地配置项', async t => {
  const files = await fixture(t, {
    vars: 'TRIGGER_SECRET_KEY=""\nTRIGGER_API_URL="http://localhost:8030"\nTRIGGER_SECRET_KEY=""\n'
  });
  await recoverLocalAgentConfig({
    ...files,
    findCredentials: async () => [{ secretKey: key, projectRef }]
  });

  const source = await readFile(files.devVarsFile, 'utf8');
  assert.equal(source.match(/^TRIGGER_SECRET_KEY=/gm)?.length, 2);
  assert.equal(source.match(new RegExp(`^TRIGGER_SECRET_KEY="${key}"$`, 'gm'))?.length, 2);
});

test('已有 key 时不查询或覆盖用户配置', async t => {
  const original = `TRIGGER_API_URL="http://localhost:8030"\nTRIGGER_SECRET_KEY="${key}"\n`;
  const files = await fixture(t, { vars: original });
  const result = await recoverLocalAgentConfig({
    ...files,
    findCredentials: async () => assert.fail('不应查询已有配置')
  });

  assert.equal(result.status, 'already-configured');
  assert.equal(await readFile(files.devVarsFile, 'utf8'), original);
});

test('本地实例没有 Development key 时不写占位值', async t => {
  const files = await fixture(t);
  const result = await recoverLocalAgentConfig({ ...files, findCredentials: async () => [] });

  assert.equal(result.status, 'not-found');
  await assert.rejects(readFile(files.devVarsFile), { code: 'ENOENT' });
  await assert.rejects(readFile(files.triggerEnvFile), { code: 'ENOENT' });
});

test('本地实例暂不可查询时保留配置并报告未完成恢复', async t => {
  const files = await fixture(t);
  const result = await recoverLocalAgentConfig({
    ...files,
    findCredentials: async () => {
      throw new Error('docker is unavailable');
    }
  });

  assert.equal(result.status, 'unavailable');
  await assert.rejects(readFile(files.devVarsFile), { code: 'ENOENT' });
});

test('多个项目时按已有 project ref 选择，未指定时不猜', async t => {
  const candidates = [
    { secretKey: key, projectRef },
    { secretKey: 'tr_dev_abcdefghij0123456789', projectRef: 'proj_anotherproject' }
  ];
  const files = await fixture(t, { triggerEnv: `TRIGGER_PROJECT_REF=${projectRef}\n` });
  const selected = await recoverLocalAgentConfig({ ...files, findCredentials: async () => candidates });
  assert.equal(selected.status, 'recovered');
  assert.match(await readFile(files.devVarsFile, 'utf8'), new RegExp(key));

  const ambiguous = await fixture(t);
  await assert.rejects(
    recoverLocalAgentConfig({ ...ambiguous, findCredentials: async () => candidates }),
    /多个 Development key.*TRIGGER_PROJECT_REF/
  );
});

test('远程实例配置缺 key 时不从本地实例拷贝', async t => {
  const files = await fixture(t, { vars: 'TRIGGER_API_URL="https://trigger.example.com"\n' });
  const result = await recoverLocalAgentConfig({
    ...files,
    findCredentials: async () => assert.fail('不能把本地 key 写到远程实例配置')
  });

  assert.equal(result.status, 'not-local');
});
