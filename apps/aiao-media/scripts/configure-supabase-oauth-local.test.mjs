import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { configureSupabaseOAuthLocal } from './configure-supabase-oauth-local.mjs';

test('读取已有私有配置，保留其他变量和有效 cookie secret，补齐本地回调并清掉不再使用的初始化 SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-oauth-config-'));
  try {
    await mkdir(join(root, 'deploy'));
    const varsPath = join(root, 'deploy/.dev.vars');
    const original =
      'SUPABASE_OAUTH_CLIENT_ID="fixture-client"\nSUPABASE_OAUTH_CLIENT_SECRET="fixture-secret"\nSUPABASE_OAUTH_COOKIE_SECRET="' +
      'a'.repeat(64) +
      '"\nSUPABASE_OAUTH_REDIRECT_URI="http://127.0.0.1:4398/api/supabase/oauth/callback"\nMEDIA_SUPABASE_URL="https://your-project.supabase.co"\nMEDIA_PLATFORM_MODELS="[]"\nMEDIA_SUPABASE_AUTOINIT_SQL=replace_with_reviewed_autoinit_bundle\nMEDIA_SUPABASE_AUTOINIT_SQL_B64="' +
      Buffer.from('-- stale bundle').toString('base64') +
      '"\n';
    await writeFile(varsPath, original);
    await configureSupabaseOAuthLocal(root, {});
    const result = parseEnv(await readFile(varsPath, 'utf8'));
    assert.equal(result.SUPABASE_OAUTH_CLIENT_ID, 'fixture-client');
    assert.equal(result.SUPABASE_OAUTH_CLIENT_SECRET, 'fixture-secret');
    assert.equal(result.SUPABASE_OAUTH_COOKIE_SECRET, 'a'.repeat(64));
    assert.equal(result.MEDIA_PLATFORM_MODELS, '[]');
    assert.equal(result.MEDIA_SUPABASE_URL, '');
    assert.equal(result.ALLOWED_PROVIDER_BASE_URLS, '["https://api.pengdevs.com"]');
    assert.equal(result.MEDIA_SUPABASE_AUTOINIT_SQL, undefined, '初始化 SQL 随构建产物发布，不再走变量');
    assert.equal(result.MEDIA_SUPABASE_AUTOINIT_SQL_B64, undefined, '旧版写入的 SQL 变量要被清掉');
    assert.equal(result.SUPABASE_OAUTH_REDIRECT_URI, 'http://localhost:4398/api/supabase/oauth/callback');
    await configureSupabaseOAuthLocal(root, {});
    const second = parseEnv(await readFile(varsPath, 'utf8'));
    assert.equal(second.SUPABASE_OAUTH_COOKIE_SECRET, result.SUPABASE_OAUTH_COOKIE_SECRET);
    assert.equal((await stat(varsPath)).mode & 0o777, 0o600);
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
