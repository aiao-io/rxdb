import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const source = new URL('../../deploy/self-hosted/compose.yaml', import.meta.url);
const fixtures = {
  MEDIA_PUBLIC_HOST: 'media.example.test',
  MEDIA_API_UID: '1000',
  MEDIA_API_GID: '1000',
  POSTGRES_PASSWORD: 'fixture-postgres-password',
  JWT_SECRET: 'fixture-jwt-secret',
  ANON_KEY: 'fixture-anon-key',
  SERVICE_ROLE_KEY: 'fixture-service-role',
  REALTIME_DB_ENC_KEY: 'fixture-db-encryption',
  SECRET_KEY_BASE: 'fixture-secret-key-base',
  SMTP_HOST: 'mail.example.test',
  SMTP_USER: 'fixture-mail-user',
  SMTP_PASS: 'fixture-mail-password',
  SMTP_ADMIN_EMAIL: 'noreply@example.test',
  MEDIA_INSTALLATION_BOOTSTRAP_SECRET: 'fixture-bootstrap-secret'
};

async function configuration() {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-self-hosted-config-'));
  try {
    await copyFile(source, join(directory, 'compose.yaml'));
    await writeFile(
      join(directory, '.env'),
      Object.entries(fixtures)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
    );
    const { stdout } = await run('docker', [
      'compose',
      '--env-file',
      join(directory, '.env'),
      '-f',
      join(directory, 'compose.yaml'),
      'config',
      '--format',
      'json'
    ]);
    return JSON.parse(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('国内部署不注入本地平台配置，模型由后台目录决定', async () => {
  const config = await configuration();
  assert.equal(config.services.api.environment.MEDIA_PLATFORM_MODELS, undefined);
  assert.equal(config.services.api.environment.MEDIA_IMAGE_API_KEY, undefined);
  assert.equal(config.services.api.environment.MEDIA_DATA_DIRECTORY, '/data');
});

test('平台配置不能覆盖账号服务凭据、数据目录和公开来源', async () => {
  const config = await configuration(
    'MEDIA_SUPABASE_SERVICE_ROLE_KEY=unexpected\nMEDIA_SUPABASE_URL=https://unexpected.example.test\nMEDIA_DATA_DIRECTORY=/unexpected\nMEDIA_PUBLIC_ORIGIN=https://unexpected.example.test\n'
  );
  const api = config.services.api.environment;
  assert.equal(api.MEDIA_SUPABASE_SERVICE_ROLE_KEY, fixtures.SERVICE_ROLE_KEY);
  assert.equal(api.MEDIA_SUPABASE_URL, 'http://127.0.0.1:8000');
  assert.equal(api.MEDIA_DATA_DIRECTORY, '/data');
  assert.equal(api.MEDIA_PUBLIC_ORIGIN, 'https://media.example.test');
});
