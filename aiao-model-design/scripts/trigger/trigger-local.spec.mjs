import assert from 'node:assert/strict';
import { chmod, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { test } from 'node:test';
import { composeArgs, initializeEnvironment, localEnvironment } from './trigger-local.mjs';

async function directory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-trigger-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function mode(file) {
  const handle = await open(file, 'r');
  try {
    return (await handle.stat()).mode & 0o777;
  } finally {
    await handle.close();
  }
}

test('首次初始化生成本地 Trigger.dev 私有凭据，再次初始化原样保留', async t => {
  const file = path.join(await directory(t), '.env');
  assert.equal(await initializeEnvironment(file), 'created');
  const first = await readFile(file, 'utf8');
  const values = parseEnv(first);
  assert.deepEqual(
    Object.keys(values).sort(),
    [
      'APP_ORIGIN',
      'CLICKHOUSE_PASSWORD',
      'COORDINATOR_SECRET',
      'DEV_OTEL_EXPORTER_OTLP_ENDPOINT',
      'DOCKER_REGISTRY_NAMESPACE',
      'DOCKER_REGISTRY_PASSWORD',
      'DOCKER_REGISTRY_URL',
      'DOCKER_REGISTRY_USERNAME',
      'ENCRYPTION_KEY',
      'EVENT_REPOSITORY_DEFAULT_STORE',
      'LOGIN_ORIGIN',
      'MAGIC_LINK_SECRET',
      'MANAGED_WORKER_SECRET',
      'MINIO_PUBLISH_IP',
      'NODE_MAX_OLD_SPACE_SIZE',
      'OBJECT_STORE_ACCESS_KEY_ID',
      'OBJECT_STORE_SECRET_ACCESS_KEY',
      'POSTGRES_PASSWORD',
      'POSTGRES_PUBLISH_IP',
      'PROVIDER_SECRET',
      'REDIS_PUBLISH_IP',
      'REGISTRY_PUBLISH_IP',
      'SESSION_SECRET',
      'TRIGGER_IMAGE_TAG',
      'WEBAPP_PUBLISH_IP'
    ].sort()
  );
  assert.equal(await mode(file), 0o600);
  assert.equal(await initializeEnvironment(file), 'kept');
  assert.equal(await readFile(file, 'utf8'), first);
});

test('本地 Trigger.dev 环境要求全部自托管凭据', async t => {
  const file = path.join(await directory(t), '.env');
  await initializeEnvironment(file);
  const env = await localEnvironment(file);
  assert.equal(env.APP_ORIGIN, 'http://127.0.0.1:8030');
  const missing = Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'CLICKHOUSE_PASSWORD'));
  await (await import('node:fs/promises')).writeFile(file, `${Object.entries(missing).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  await assert.rejects(localEnvironment(file), /CLICKHOUSE_PASSWORD/);
});

test('Compose 固定使用隔离项目与官方 webapp/worker 两个栈文件', () => {
  assert.deepEqual(composeArgs(['ps']).slice(0, 8), [
    'compose',
    '--project-name',
    'aiao-model-design-trigger',
    '--env-file',
    expectPath('infra/trigger/.env'),
    '-f',
    expectPath('infra/trigger/webapp-compose.yml'),
    '-f',
    expectPath('infra/trigger/worker-compose.yml')
  ]);
});

function expectPath(suffix) {
  return composeArgs([]).find(value => value.endsWith(suffix));
}
