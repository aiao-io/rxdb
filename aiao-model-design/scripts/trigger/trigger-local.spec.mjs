import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import {
  composeArgs,
  initializeEnvironment,
  localEnvironment,
  migrateLocalEndpoints,
  parseDevelopmentCredentials
} from './trigger-local.mjs';

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
      'API_ORIGIN',
      'APP_ORIGIN',
      'CLICKHOUSE_PASSWORD',
      'CLICKHOUSE_PUBLISH_IP',
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
      'OBJECT_STORE_DEFAULT_PROTOCOL',
      'OBJECT_STORE_MINIO_ACCESS_KEY_ID',
      'OBJECT_STORE_MINIO_BASE_URL',
      'OBJECT_STORE_MINIO_BUCKET',
      'OBJECT_STORE_MINIO_REGION',
      'OBJECT_STORE_MINIO_SECRET_ACCESS_KEY',
      'OBJECT_STORE_MINIO_SERVICE',
      'OBJECT_STORE_SECRET_ACCESS_KEY',
      'POSTGRES_PASSWORD',
      'POSTGRES_PUBLISH_IP',
      'PROVIDER_SECRET',
      'REALTIME_STREAMS_S2_ENDPOINT',
      'REDIS_PUBLISH_IP',
      'REGISTRY_PUBLISH_IP',
      'S2_PUBLISH_IP',
      'S2_PUBLISH_PORT',
      'SESSION_SECRET',
      'TRIGGER_IMAGE_TAG',
      'WEBAPP_PUBLISH_IP'
    ].sort()
  );
  assert.equal(await mode(file), 0o600);
  assert.equal(values.MINIO_PUBLISH_IP, '0.0.0.0');
  assert.match(values.OBJECT_STORE_MINIO_BASE_URL, /^http:\/\/[^/]+:9000$/);
  assert.notEqual(values.OBJECT_STORE_MINIO_BASE_URL, 'http://minio:9000');
  assert.equal(values.S2_PUBLISH_IP, '0.0.0.0');
  assert.equal(values.S2_PUBLISH_PORT, '8050');
  assert.match(values.REALTIME_STREAMS_S2_ENDPOINT, /^http:\/\/[^/]+:8050\/v1$/);
  assert.notEqual(values.REALTIME_STREAMS_S2_ENDPOINT, 'http://s2/v1');
  assert.equal(await initializeEnvironment(file), 'kept');
  assert.equal(await readFile(file, 'utf8'), first);
});

test('迁移旧 Docker 内部 endpoint，并补齐宿主机 S2 发布配置', async t => {
  const file = path.join(await directory(t), '.env');
  await writeFile(file, 'OBJECT_STORE_MINIO_BASE_URL=http://minio:9000\nREALTIME_STREAMS_S2_ENDPOINT=http://s2/v1\n');
  const previousHost = process.env.TRIGGER_OBJECT_STORE_HOST;
  process.env.TRIGGER_OBJECT_STORE_HOST = '192.0.2.10';
  t.after(() => {
    if (previousHost === undefined) delete process.env.TRIGGER_OBJECT_STORE_HOST;
    else process.env.TRIGGER_OBJECT_STORE_HOST = previousHost;
  });

  assert.equal(await migrateLocalEndpoints(file), true);
  const values = parseEnv(await readFile(file, 'utf8'));
  assert.equal(values.OBJECT_STORE_MINIO_BASE_URL, 'http://192.0.2.10:9000');
  assert.equal(values.REALTIME_STREAMS_S2_ENDPOINT, 'http://192.0.2.10:8050/v1');
  assert.equal(values.MINIO_PUBLISH_IP, '0.0.0.0');
  assert.equal(values.S2_PUBLISH_IP, '0.0.0.0');
  assert.equal(values.S2_PUBLISH_PORT, '8050');
});

test('保留用户自定义 S2 endpoint，只补缺失的发布配置', async t => {
  const file = path.join(await directory(t), '.env');
  await writeFile(file, 'REALTIME_STREAMS_S2_ENDPOINT=https://s2.example.test/v1\n');

  assert.equal(await migrateLocalEndpoints(file), true);
  const values = parseEnv(await readFile(file, 'utf8'));
  assert.equal(values.REALTIME_STREAMS_S2_ENDPOINT, 'https://s2.example.test/v1');
  assert.equal(values.S2_PUBLISH_IP, '0.0.0.0');
  assert.equal(values.S2_PUBLISH_PORT, '8050');
});

test('本地 Trigger.dev 环境要求全部自托管凭据', async t => {
  const file = path.join(await directory(t), '.env');
  await initializeEnvironment(file);
  const env = await localEnvironment(file);
  assert.equal(env.APP_ORIGIN, 'http://127.0.0.1:8030');
  const missing = Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'CLICKHOUSE_PASSWORD'));
  await writeFile(
    file,
    `${Object.entries(missing)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
  await assert.rejects(localEnvironment(file), /CLICKHOUSE_PASSWORD/);
});

test('Compose 固定复用产品 infra 入口并隔离 Trigger 项目', () => {
  assert.deepEqual(composeArgs(['ps']).slice(0, 9), [
    'compose',
    '--project-name',
    'aiao-model-design-trigger',
    '--env-file',
    expectPath('infra/supabase/.env'),
    '--env-file',
    expectPath('infra/supabase/ports.env'),
    '-f',
    expectPath('infra/supabase/docker-compose.yml')
  ]);
});

test('解析本地 Development key 查询结果，不打印或改写密钥', () => {
  assert.deepEqual(parseDevelopmentCredentials('tr_dev_sk_0123456789abcdefghij\tproj_xjkrazglzqhfhhbwdllb\n'), [
    { secretKey: 'tr_dev_sk_0123456789abcdefghij', projectRef: 'proj_xjkrazglzqhfhhbwdllb' }
  ]);
  assert.deepEqual(parseDevelopmentCredentials(''), []);
});

function expectPath(suffix) {
  return composeArgs([]).find(value => value.endsWith(suffix));
}
