import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { isAutoinitBundle } from '../server/cloudflare/supabase-oauth.mjs';
import {
  buildProductionBundle,
  emptyPublicGuard,
  productionSources,
  schemaMarker,
  schemaVersion
} from './build-production-supabase-bundle.mjs';
import {
  applicationFunctions,
  applicationRelations,
  autoinitOutput,
  buildAutoinitBundle
} from './build-supabase-autoinit.mjs';

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

/** 只带初始化包所依赖托管对象（auth.users / auth.uid、storage 目录）的空 Supabase 项目。 */
async function supabaseProject() {
  const db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
  `);
  return db;
}
/** 执行整个初始化包；失败时像管理接口那样丢弃这次事务。 */
async function apply(db, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
const names = async (db, query) => (await db.query(query)).rows.map(row => row.name).sort();
const schemaComment = async db =>
  (await db.query(`SELECT obj_description('media_private'::regnamespace, 'pg_namespace') AS marker`)).rows[0].marker;
const refusal = pattern => error => error?.code === '55006' && pattern.test(error.message);

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
    assert.equal(first.sql.endsWith(`${schemaMarker}\nCOMMIT;\n`), true);
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
    const guard = sql.indexOf('$aiao_media_autoinit_guard$');
    assert.ok(guard > 0 && guard < sql.indexOf('CREATE TABLE'));
    assert.ok(sql.endsWith(`${schemaMarker}\nCOMMIT;\n`));
    assert.deepEqual(
      managedDdl.flatMap(pattern => withoutComments(sql).match(pattern) ?? []),
      []
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('automatic onboarding bundle is published as a static asset and satisfies the Worker integrity check', async () => {
  assert.equal(resolve(autoinitOutput), resolve(application, 'public/supabase-autoinit.sql'));
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-autoinit-'));
  try {
    const { sql } = await buildAutoinitBundle(join(directory, 'supabase-autoinit.sql'));
    assert.equal(isAutoinitBundle(sql), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('automatic onboarding creates exactly the allow-listed objects and re-runs only on its own dedicated project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-autoinit-'));
  const db = await supabaseProject();
  try {
    const { sql } = await buildAutoinitBundle(join(directory, 'autoinit.sql'));
    await apply(db, sql);
    // 守卫按这两张清单放行本应用的对象；迁移增删 public 对象时这里会提醒同步清单。
    assert.deepEqual(
      await names(
        db,
        `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')`
      ),
      [...applicationRelations].sort()
    );
    assert.deepEqual(
      await names(
        db,
        `SELECT DISTINCT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p', 'a')`
      ),
      [...applicationFunctions].sort()
    );
    assert.equal(await schemaComment(db), `aiao-media schema ${schemaVersion}`);
    await apply(db, sql);
    // 写版本标记之前初始化的专用项目按兼容处理，并补上标记。
    await db.exec('COMMENT ON SCHEMA media_private IS NULL');
    await apply(db, sql);
    assert.equal(await schemaComment(db), `aiao-media schema ${schemaVersion}`);

    await db.exec('CREATE TABLE public.photo_orders (id integer PRIMARY KEY)');
    await assert.rejects(apply(db, sql), refusal(/objects outside this application/));
    await db.exec('DROP TABLE public.photo_orders');
    await db.exec(`COMMENT ON SCHEMA media_private IS 'aiao-media schema ${schemaVersion + 1}'`);
    await assert.rejects(apply(db, sql), refusal(/newer than this application/));
    assert.equal(await schemaComment(db), `aiao-media schema ${schemaVersion + 1}`);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('automatic onboarding refuses a shared project before any write and keeps same-name business functions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-autoinit-'));
  const businessFunction =
    'CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.touched := now(); RETURN NEW; END $$;';
  try {
    const { sql } = await buildAutoinitBundle(join(directory, 'autoinit.sql'));
    for (const business of [
      `CREATE TABLE public.unrelated_business (id integer PRIMARY KEY); ${businessFunction}`,
      businessFunction
    ]) {
      const db = await supabaseProject();
      try {
        await db.exec(business);
        await assert.rejects(apply(db, sql), refusal(/not empty and was not initialized by this application/));
        const { rows } = await db.query(`SELECT prosrc FROM pg_proc WHERE proname = 'update_updated_at_column'`);
        assert.match(rows[0].prosrc, /NEW\.touched/);
        assert.equal((await db.query(`SELECT to_regnamespace('media_private') AS schema`)).rows[0].schema, null);
        assert.equal((await db.query(`SELECT count(*)::int AS count FROM storage.buckets`)).rows[0].count, 0);
      } finally {
        await db.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a project set up with the reviewed manual bundle is accepted by automatic onboarding', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-autoinit-'));
  const db = await supabaseProject();
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'production.sql'))).sql);
    assert.equal(await schemaComment(db), `aiao-media schema ${schemaVersion}`);
    await apply(db, (await buildAutoinitBundle(join(directory, 'autoinit.sql'))).sql);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
