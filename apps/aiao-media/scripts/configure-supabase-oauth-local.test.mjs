import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { configureSupabaseOAuthLocal } from './configure-supabase-oauth-local.mjs';

test('读取已有私有配置，保留其他变量和有效 cookie secret，补齐本地回调与 SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-oauth-config-'));
  try {
    await mkdir(join(root, 'deploy'));
    await mkdir(join(root, 'tmp'));
    const varsPath = join(root, 'deploy/.dev.vars');
    const original =
      'SUPABASE_OAUTH_CLIENT_ID="fixture-client"\nSUPABASE_OAUTH_CLIENT_SECRET="fixture-secret"\nSUPABASE_OAUTH_COOKIE_SECRET="' +
      'a'.repeat(64) +
      '"\nSUPABASE_OAUTH_REDIRECT_URI="http://127.0.0.1:4398/api/supabase/oauth/callback"\nMEDIA_SUPABASE_URL="https://your-project.supabase.co"\nMEDIA_PLATFORM_MODELS="[]"\nMEDIA_SUPABASE_AUTOINIT_SQL=replace_with_reviewed_autoinit_bundle\n';
    await writeFile(varsPath, original);
    const sql = '-- reviewed fixture\nBEGIN;\nSELECT 1;\nCOMMIT;\n';
    await writeFile(join(root, 'tmp/supabase-autoinit.sql'), sql);
    await configureSupabaseOAuthLocal(root, {});
    const result = parseEnv(await readFile(varsPath, 'utf8'));
    assert.equal(result.SUPABASE_OAUTH_CLIENT_ID, 'fixture-client');
    assert.equal(result.SUPABASE_OAUTH_CLIENT_SECRET, 'fixture-secret');
    assert.equal(result.SUPABASE_OAUTH_COOKIE_SECRET, 'a'.repeat(64));
    assert.equal(result.MEDIA_PLATFORM_MODELS, '[]');
    assert.equal(result.MEDIA_SUPABASE_URL, '');
    assert.equal(result.ALLOWED_PROVIDER_BASE_URLS, '["https://api.pengdevs.com"]');
    assert.equal(result.MEDIA_SUPABASE_AUTOINIT_SQL, undefined);
    assert.equal(result.SUPABASE_OAUTH_REDIRECT_URI, 'http://localhost:4398/api/supabase/oauth/callback');
    assert.equal(Buffer.from(result.MEDIA_SUPABASE_AUTOINIT_SQL_B64, 'base64').toString('utf8'), sql);
    assert.equal((await stat(varsPath)).mode & 0o777, 0o600);
    await configureSupabaseOAuthLocal(root, {});
    assert.equal(
      parseEnv(await readFile(varsPath, 'utf8')).SUPABASE_OAUTH_COOKIE_SECRET,
      result.SUPABASE_OAUTH_COOKIE_SECRET
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('凭据缺失或为占位内容时不改写原配置', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-oauth-config-'));
  try {
    await mkdir(join(root, 'deploy'));
    const path = join(root, 'deploy/.dev.vars');
    const original = 'SUPABASE_OAUTH_CLIENT_ID=replace_in_worker_secrets\nCUSTOM_VALUE=kept\n';
    await writeFile(path, original);
    await assert.rejects(configureSupabaseOAuthLocal(root, {}), /Client ID/);
    assert.equal(await readFile(path, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
