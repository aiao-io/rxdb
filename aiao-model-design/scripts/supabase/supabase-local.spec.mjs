import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { initializeEnvironment, localEnvironment, supabaseRolePasswordSql } from './supabase-local.mjs';

const SECRETS = {
  POSTGRES_PASSWORD: 'fixture-password',
  JWT_SECRET: 'fixture-jwt-secret',
  ANON_KEY: 'fixture.anon.key',
  SERVICE_ROLE_KEY: 'fixture.service.key'
};

async function directory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-supabase-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function files(t, { env, ports = { API_PORT: '54421', DB_PORT: '54422' } }) {
  const root = await directory(t);
  const envFile = path.join(root, '.env');
  const portsFile = path.join(root, 'ports.env');
  const lines = values =>
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  if (env) await writeFile(envFile, lines(env), { mode: 0o600 });
  await writeFile(portsFile, lines(ports));
  return { envFile, portsFile };
}

function verifiedClaims(token, secret) {
  const [header, payload, signature] = token.split('.');
  assert.equal(signature, createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'));
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

test('首次初始化生成仅本人可读的随机凭据，再次初始化原样保留', async t => {
  const envFile = path.join(await directory(t), '.env');
  assert.equal(await initializeEnvironment(envFile), 'created');
  const first = await readFile(envFile, 'utf8');
  assert.equal((await stat(envFile)).mode & 0o777, 0o600);
  const env = parseEnv(first);
  assert.deepEqual(Object.keys(env).sort(), ['ANON_KEY', 'JWT_SECRET', 'POSTGRES_PASSWORD', 'SERVICE_ROLE_KEY']);
  assert.equal(verifiedClaims(env.ANON_KEY, env.JWT_SECRET).role, 'anon');
  assert.equal(verifiedClaims(env.SERVICE_ROLE_KEY, env.JWT_SECRET).role, 'service_role');

  assert.equal(await initializeEnvironment(envFile), 'kept');
  assert.equal(await readFile(envFile, 'utf8'), first);
  const second = path.join(path.dirname(envFile), 'second.env');
  await initializeEnvironment(second);
  assert.notEqual(parseEnv(await readFile(second, 'utf8')).JWT_SECRET, env.JWT_SECRET);
});

test('端口以提交的 ports.env 为准，私有凭据文件里的端口不生效', async t => {
  const paths = await files(t, { env: { ...SECRETS, API_PORT: '56521', DB_PORT: '56522' } });
  const local = await localEnvironment(paths);
  assert.equal(local.url, 'http://127.0.0.1:54421');
  assert.equal(local.env.DB_PORT, '54422');
  assert.equal(local.env.SERVICE_ROLE_KEY, SECRETS.SERVICE_ROLE_KEY);
  assert.equal(local.databaseUrl, 'postgresql://postgres:fixture-password@127.0.0.1:54422/postgres');
});

test('还没初始化时提示先运行 supabase-up', async t => {
  await assert.rejects(localEnvironment(await files(t, {})), /aiao-model-design:supabase-up/);
});

test('凭据缺失或端口无效、重复时拒绝启动', async t => {
  const { POSTGRES_PASSWORD, ...withoutPassword } = SECRETS;
  assert.ok(POSTGRES_PASSWORD);
  await assert.rejects(localEnvironment(await files(t, { env: withoutPassword })), /POSTGRES_PASSWORD/);
  await assert.rejects(
    localEnvironment(await files(t, { env: { ...SECRETS, JWT_SECRET: 'has spaces' } })),
    /JWT_SECRET/
  );
  await assert.rejects(
    localEnvironment(await files(t, { env: SECRETS, ports: { API_PORT: '80', DB_PORT: '54422' } })),
    /API_PORT/
  );
  await assert.rejects(
    localEnvironment(await files(t, { env: SECRETS, ports: { API_PORT: '54421', DB_PORT: '54421' } })),
    /不能重复/
  );
});

test('Kong 的声明式配置折成一行 JSON：/auth/v1/ 转给 GoTrue，并校验 anon 与 service role 的 apikey', async () => {
  const compose = await readFile(path.resolve(import.meta.dirname, '../../infra/supabase/docker-compose.yml'), 'utf8');
  const lines = compose.split('\n');
  const start = lines.findIndex(line => line.trim() === 'KONG_DECLARATIVE_CONFIG_STRING: >-');
  assert.ok(start > 0);
  const indent = /^ */.exec(lines[start + 1])[0];
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(indent)) break;
    block.push(line.slice(indent.length));
  }
  // `>-` 只把缩进相同的行折成空格；更深的缩进会保留换行，Kong 落到 .kong_env 时只剩第一行。
  assert.ok(
    block.every(line => !/^\s/.test(line)),
    block.join('\n')
  );
  const config = JSON.parse(block.join(' ').replace(/\$\{(\w+)(?::\?[^}]*)?\}/g, (_, name) => `<${name}>`));
  assert.deepEqual(
    config.consumers.map(consumer => [consumer.username, consumer.keyauth_credentials.map(item => item.key)]),
    [
      ['anon', ['<ANON_KEY>']],
      ['service_role', ['<SERVICE_ROLE_KEY>']]
    ]
  );
  assert.deepEqual(config.services, [
    {
      name: 'auth',
      url: 'http://auth:9999/',
      routes: [{ name: 'auth', paths: ['/auth/v1/'], strip_path: true }],
      plugins: [{ name: 'key-auth', config: { hide_credentials: false } }]
    }
  ]);
});

test('同步角色密码的 SQL 覆盖连接、管理与 Auth 用的角色', () => {
  assert.equal(
    supabaseRolePasswordSql('fixture-password'),
    [
      "ALTER ROLE postgres PASSWORD 'fixture-password';",
      "ALTER ROLE supabase_admin PASSWORD 'fixture-password';",
      "ALTER ROLE supabase_auth_admin PASSWORD 'fixture-password';"
    ].join('\n')
  );
  assert.throws(() => supabaseRolePasswordSql("x' OR '1'='1"), /POSTGRES_PASSWORD/);
});
