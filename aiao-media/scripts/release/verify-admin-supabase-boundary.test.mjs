import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertAdminSupabaseBoundary, scanAdminSupabaseBoundary } from './verify-admin-supabase-boundary.mjs';

async function fixture(bundle, source = 'export const auth = true;') {
  const root = await mkdtemp(join(tmpdir(), 'aiao-media-admin-boundary-'));
  const bundleRoot = join(root, 'bundle');
  const sourceRoot = join(root, 'source');
  await writeFile(join(root, 'placeholder'), '');
  await mkdir(bundleRoot);
  await mkdir(sourceRoot);
  await writeFile(join(bundleRoot, 'main.js'), bundle);
  await writeFile(join(sourceRoot, 'app.ts'), source);
  return { root, bundleRoot, sourceRoot };
}

test('允许 publishable key 和 Supabase Auth 调用，拒绝旧登录代理调用方', async () => {
  const fixtureRoot = await fixture('const key = "sb_publishable_fixture";');
  try {
    await assertAdminSupabaseBoundary(fixtureRoot);
  } finally {
    await rm(fixtureRoot.root, { recursive: true, force: true });
  }

  const legacy = await fixture('const key = "sb_publishable_fixture";', 'fetch("/api/admin/login");');
  try {
    await assert.rejects(assertAdminSupabaseBoundary(legacy), /旧登录代理/);
  } finally {
    await rm(legacy.root, { recursive: true, force: true });
  }
});

test('拒绝 service role、secret key 和静态 JWT 出现在生产 bundle', async () => {
  const fixtureRoot = await fixture('const key = "sb_secret_123456789012345678901234";');
  try {
    const report = await scanAdminSupabaseBoundary(fixtureRoot);
    assert.equal(report.bundleFindings.length, 1);
    await assert.rejects(assertAdminSupabaseBoundary(fixtureRoot), /service-role key value/);
  } finally {
    await rm(fixtureRoot.root, { recursive: true, force: true });
  }
});
