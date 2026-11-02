import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildProductionBundle, emptyPublicGuard, productionSources } from './build-production-supabase-bundle.mjs';
import { buildAutoinitBundle } from './build-supabase-autoinit.mjs';

const application = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(application, '../..');
const managed = '"?(?:auth|storage|realtime)"?';
const managedDdl = [
  `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|FUNCTION|PROCEDURE|VIEW|MATERIALIZED\\s+VIEW|SEQUENCE|TYPE)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${managed}\\.`,
  `CREATE\\s+SCHEMA\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${managed}\\b`,
  `ALTER\\s+(?:TABLE|FUNCTION|SEQUENCE|VIEW)\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${managed}\\.`,
  `DROP\\s+(?:TABLE|FUNCTION|VIEW|SEQUENCE|TYPE)\\s+(?:IF\\s+EXISTS\\s+)?${managed}\\.`,
  `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\b[^;]*?\\bON\\s+(?:ONLY\\s+)?${managed}\\.`,
  '(?:TRUNCATE|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:auth\\.schema_migrations|storage\\.migrations|realtime\\.schema_migrations)\\b'
].map(pattern => new RegExp(pattern, 'gi'));
const withoutComments = sql => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

test('production bundle is deterministic, excludes development probe, and keeps source digests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-production-sql-'));
  try {
    const first = await buildProductionBundle(join(directory, 'first.sql'));
    const second = await buildProductionBundle(join(directory, 'second.sql'));
    assert.equal(first.sql, second.sql);
    assert.equal(first.sources.length, 13);
    assert.deepEqual(
      first.sources.map(source => source.relativePath),
      productionSources
    );
    assert.ok(
      !first.sql.includes('-- BEGIN SOURCE apps/aiao-media/infra/supabase/migrations/001-local-account-checks.sql')
    );
    for (const source of first.sources) {
      assert.match(
        first.sql,
        new RegExp(`SOURCE ${source.relativePath.replaceAll('/', '\\/')} sha256=${source.digest}`)
      );
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
  assert.match(emptyPublicGuard, /p\.prokind IN \('f', 'p', 'a'\)/);
  assert.match(emptyPublicGuard, /pg_advisory_xact_lock/);
  assert.match(emptyPublicGuard, /ERRCODE = '55006'/);
  assert.match(emptyPublicGuard, /geography_columns/);
});

test('JPEG metadata migration preserves PNG validation and rejects other formats in PostgreSQL', async () => {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE SCHEMA media_private;');
    const original = await readFile(
      new URL('../infra/supabase/migrations/005-product-content.sql', import.meta.url),
      'utf8'
    );
    await db.exec(original.slice(0, original.indexOf('ALTER TABLE public.media_sync_records')) + 'COMMIT;');
    const payload = {
      version: 1,
      jobId: '00000000-0000-4000-8000-000000000001',
      providerInstanceId: '00000000-0000-4000-8000-000000000002',
      prompt: '原图',
      modelId: 'image-01',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      bytes: 1000,
      sha256: 'a'.repeat(64),
      createdAt: '2026-10-25T13:00:00Z'
    };
    const valid = async mimeType =>
      (
        await db.query("SELECT media_private.valid_record_payload('work', $1) AS valid", [
          JSON.stringify({ ...payload, mimeType })
        ])
      ).rows[0].valid;
    assert.equal(await valid('image/png'), true);
    assert.equal(await valid('image/jpeg'), false);
    await db.exec(
      await readFile(new URL('../infra/supabase/migrations/007-jpeg-work-metadata.sql', import.meta.url), 'utf8')
    );
    assert.equal(await valid('image/png'), true);
    assert.equal(await valid('image/jpeg'), true);
    assert.equal(await valid('image/gif'), false);
  } finally {
    await db.close();
  }
});

test('production sources never create or alter objects in Supabase-managed schemas', async () => {
  for (const relativePath of productionSources) {
    const sql = withoutComments(await readFile(resolve(repositoryRoot, relativePath), 'utf8'));
    const hits = managedDdl.flatMap(pattern => sql.match(pattern) ?? []);
    assert.deepEqual(hits, [], relativePath);
  }
});

test('local Storage stand-in runs before the storage migration and stays out of production sources', async () => {
  const migrations = (await readdir(resolve(application, 'infra/supabase/migrations'))).sort();
  const standIn = migrations.indexOf('001-local-storage-standin.sql');
  assert.ok(standIn >= 0, 'stand-in migration exists');
  assert.ok(standIn < migrations.indexOf('010-image-storage.sql'), 'stand-in runs before the storage migration');
  assert.ok(!productionSources.some(path => path.endsWith('001-local-storage-standin.sql')));
});

test('automatic onboarding bundle is created in a missing output directory from the production sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-autoinit-'));
  try {
    const { output, sql } = await buildAutoinitBundle(join(directory, 'missing', 'supabase-autoinit.sql'));
    assert.equal(await readFile(output, 'utf8'), sql);
    for (const path of productionSources) assert.ok(sql.includes(`-- BEGIN ${path}\n`), path);
    assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
    assert.deepEqual(
      managedDdl.flatMap(pattern => withoutComments(sql).match(pattern) ?? []),
      []
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
