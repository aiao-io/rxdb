import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { localEnvironment } from '../supabase/supabase-local.mjs';

test('checkout credentials cannot change the fixed public service addresses', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'aiao-media-ports-'));
  const file = resolve(directory, '.env');
  const credentials = {
    POSTGRES_PASSWORD: 'fixture-password',
    JWT_SECRET: 'fixture-secret',
    ANON_KEY: 'fixture-anon',
    SERVICE_ROLE_KEY: 'fixture-service-role',
    REALTIME_DB_ENC_KEY: 'fixture-encryption',
    SECRET_KEY_BASE: 'fixture-key-base',
    PG_META_CRYPTO_KEY: 'fixture-meta-key',
    COMPOSE_PROJECT_NAME: 'fixture-project'
  };
  try {
    await writeFile(
      file,
      Object.entries({ API_PORT: '56521', DB_PORT: '56522', STUDIO_PORT: '56523', MAIL_PORT: '56524', ...credentials })
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
      { mode: 0o600 }
    );
    const local = await localEnvironment(file);
    assert.equal(local.url, 'http://127.0.0.1:54321');
    assert.equal(local.mailUrl, 'http://127.0.0.1:54324');
    assert.equal(local.env.DB_PORT, '54322');
    assert.equal(local.env.STUDIO_PORT, '54323');
    assert.equal(local.publicEnv.AIAO_SUPABASE_URL, local.url);
    assert.equal(local.env.COMPOSE_PROJECT_NAME, credentials.COMPOSE_PROJECT_NAME);
    assert.ok(local.env.SERVICE_ROLE_KEY === credentials.SERVICE_ROLE_KEY);
    assert.ok(local.publicEnv.AIAO_SUPABASE_ANON_KEY === credentials.ANON_KEY);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
