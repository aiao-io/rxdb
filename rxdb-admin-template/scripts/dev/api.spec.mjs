import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ports } from '../../deploy/scripts/lib/paths.mjs';
import { apiEnvironment } from './api.mjs';
import { devOrigins } from './services.mjs';

const product = path.resolve(import.meta.dirname, '../..');
const secrets = {
  ANON_KEY: 'anon-key-value',
  ADMIN_SERVICE_PASSWORD: 'service-password-value',
  POSTGRES_PASSWORD: 'superuser-password-value',
  SERVICE_ROLE_KEY: 'service-role-key-value',
  JWT_SECRET: 'jwt-secret-value',
  ADMIN_BOOTSTRAP_KEY: 'bootstrap-key-value'
};

describe('本地开发的协作命令服务', () => {
  it('经本地栈的网关取公开配置，按 JWKS 验签，签发者与 GoTrue 一致', async () => {
    const env = apiEnvironment(secrets);
    assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:4500');
    assert.equal(env.SUPABASE_ANON_KEY, secrets.ANON_KEY);
    assert.equal(env.SUPABASE_JWKS_URL, 'http://127.0.0.1:4500/auth/v1/.well-known/jwks.json');
    const compose = await readFile(path.join(product, 'deploy/local/docker-compose.yml'), 'utf8');
    assert.ok(compose.includes(`GOTRUE_JWT_ISSUER: ${env.SUPABASE_JWT_ISSUER}\n`));
  });

  it('以协作专用角色经 transaction 模式的连接池连库（与生产的 Supavisor 同一种约束）', () => {
    const database = new URL(apiEnvironment(secrets).ADMIN_DATABASE_URL);
    assert.equal(database.username, 'admin_collaboration');
    assert.equal(database.password, secrets.ADMIN_SERVICE_PASSWORD);
    assert.equal(database.hostname, '127.0.0.1');
    assert.equal(database.port, String(ports.pooler));
  });

  it('放行三端开发服务器的来源，错误报告发给本地收集器，发布标识为 dev', () => {
    const env = apiEnvironment(secrets);
    assert.deepEqual(env.ADMIN_ALLOWED_ORIGINS.split(','), devOrigins);
    assert.equal(env.ADMIN_ERROR_REPORT_URL, 'http://127.0.0.1:4505/ingest');
    assert.equal(env.ADMIN_RELEASE, 'dev');
  });

  it('拿不到超级用户口令、service role key、JWT 共享密钥与初始化密钥', () => {
    const values = Object.values(apiEnvironment(secrets)).join('\n');
    for (const name of ['POSTGRES_PASSWORD', 'SERVICE_ROLE_KEY', 'JWT_SECRET', 'ADMIN_BOOTSTRAP_KEY'])
      assert.ok(!values.includes(secrets[name]), name);
  });
});
