import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildProductionBundle, emptyPublicGuard, productionSources } from './build-production-supabase-bundle.mjs';

test('production bundle is deterministic, excludes development probe, and keeps source digests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-production-sql-'));
  try {
    const first = await buildProductionBundle(join(directory, 'first.sql'));
    const second = await buildProductionBundle(join(directory, 'second.sql'));
    assert.equal(first.sql, second.sql);
    assert.equal(first.sources.length, 9);
    assert.deepEqual(first.sources.map(source => source.relativePath), productionSources);
    assert.ok(!first.sql.includes('-- BEGIN SOURCE apps/aiao-media/infra/supabase/migrations/001-local-account-checks.sql'));
    for (const source of first.sources) {
      assert.match(first.sql, new RegExp(`SOURCE ${source.relativePath.replaceAll('/', '\\/')} sha256=${source.digest}`));
    }
    assert.equal(first.sql.indexOf('aiao_media_empty_project_guard') < first.sql.indexOf('CREATE TABLE'), true);
    assert.equal(first.sql.startsWith('-- Aiao Media production Supabase bootstrap bundle.\n'), true);
    assert.equal(first.sql.includes('\nBEGIN;\nSET LOCAL lock_timeout'), true);
    assert.equal(first.sql.endsWith('COMMIT;\n'), true);
    assert.equal((first.sql.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((first.sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('guard rejects non-empty public relations and pre-existing product/RxDB functions', () => {
  assert.match(emptyPublicGuard, /public schema is not empty/);
  assert.match(emptyPublicGuard, /c\.relkind IN \('r', 'p', 'v', 'm', 'f', 'S'\)/);
  assert.match(emptyPublicGuard, /t\.typtype IN \('c', 'e', 'd'\)/);
  assert.match(emptyPublicGuard, /media\\_%/);
  assert.match(emptyPublicGuard, /rxdb\\_%/);
  assert.match(emptyPublicGuard, /get_ancestors/);
  assert.match(emptyPublicGuard, /pg_advisory_xact_lock/);
  assert.match(emptyPublicGuard, /ERRCODE = '55006'/);
  assert.match(emptyPublicGuard, /geography_columns/);
});
