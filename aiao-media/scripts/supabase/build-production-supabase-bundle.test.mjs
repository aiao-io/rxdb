import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildProductionBundle,
  emptyPublicGuard,
  productionSources,
  buildProductionUpgrade as productionUpgrade,
  schemaMarker,
  schemaVersion
} from './build-production-supabase-bundle.mjs';

const application = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(application, '..');
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
/** 执行整个生产初始化包；失败时丢弃本次事务。 */
async function apply(db, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
const schemaComment = async db =>
  (await db.query(`SELECT obj_description('media_private'::regnamespace, 'pg_namespace') AS marker`)).rows[0].marker;
const refusal = pattern => error => error?.code === '55006' && pattern.test(error.message);

test('production bundle is deterministic, excludes development probe, and keeps source digests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-production-sql-'));
  try {
    const first = await buildProductionBundle(join(directory, 'first.sql'));
    const second = await buildProductionBundle(join(directory, 'second.sql'));
    assert.equal(first.sql, second.sql);
    assert.equal(first.sources.length, 19);
    assert.deepEqual(
      first.sources.map(source => source.relativePath),
      productionSources
    );
    assert.ok(!first.sql.includes('-- BEGIN SOURCE aiao-media/infra/supabase/migrations/001-local-account-checks.sql'));
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
      new URL('../../infra/supabase/migrations/005-product-content.sql', import.meta.url),
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
      await readFile(new URL('../../infra/supabase/migrations/007-jpeg-work-metadata.sql', import.meta.url), 'utf8')
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

test('production bootstrap initializes platform workspaces and private image storage in one transaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-production-sql-'));
  const db = await supabaseProject();
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'production.sql'))).sql);
    assert.equal(await schemaComment(db), `aiao-media schema ${schemaVersion}`);
    assert.equal(
      (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.media_sync_records'::regclass")).rows[0]
        .relrowsecurity,
      true
    );
    assert.deepEqual((await db.query("SELECT id, public FROM storage.buckets WHERE id = 'aiao-media-images'")).rows, [
      { id: 'aiao-media-images', public: false }
    ]);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('production bootstrap refuses an occupied project before writing and preserves existing business data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aiao-media-production-sql-'));
  const db = await supabaseProject();
  try {
    await db.exec("CREATE TABLE public.business_data (value text); INSERT INTO public.business_data VALUES ('kept');");
    const { sql } = await buildProductionBundle(join(directory, 'production.sql'));
    await assert.rejects(apply(db, sql), refusal(/public schema is not empty/));
    assert.deepEqual((await db.query('SELECT value FROM public.business_data')).rows, [{ value: 'kept' }]);
    assert.equal((await db.query("SELECT to_regnamespace('media_private') AS schema")).rows[0].schema, null);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM storage.buckets')).rows[0].count, 0);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('安装授权仅服务端可执行，原子创建首个管理员且重复请求不能提权', async () => {
  const db = await supabaseProject();
  const directory = await mkdtemp(join(tmpdir(), 'aiao-installation-sql-'));
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'production.sql'))).sql);
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [owner, other]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT public.media_bootstrap_admin($1,$2)', [owner, requestId]), {
        code: '42501'
      });
      await assert.rejects(db.query('SELECT * FROM public.media_installation_state'), { code: '42501' });
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    for (let retry = 0; retry < 2; retry++)
      assert.equal(
        (await db.query('SELECT public.media_bootstrap_admin($1,$2) AS owner', [owner, requestId])).rows[0].owner,
        owner
      );
    await assert.rejects(db.query('SELECT public.media_bootstrap_admin($1,$2)', [other, crypto.randomUUID()]), {
      code: 'PT409'
    });
    assert.deepEqual((await db.query('SELECT user_id, revision FROM public.media_admin_memberships')).rows, [
      { user_id: owner, revision: 1 }
    ]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.media_admin_audit')).rows[0].count, 1);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('已有站点必须由原管理员接入，不能用安装向导添加新管理员', async () => {
  const db = await supabaseProject();
  const directory = await mkdtemp(join(tmpdir(), 'aiao-existing-installation-sql-'));
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID();
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'production.sql'))).sql);
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [owner, other]);
    await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [owner]);
    await db.exec('SET ROLE service_role');
    await assert.rejects(db.query('SELECT public.media_bootstrap_admin($1,$2)', [other, crypto.randomUUID()]), {
      code: '42501'
    });
    assert.equal(
      (await db.query('SELECT public.media_bootstrap_admin($1,$2) AS owner', [owner, crypto.randomUUID()])).rows[0]
        .owner,
      owner
    );
    assert.deepEqual((await db.query('SELECT user_id, revision FROM public.media_admin_memberships')).rows, [
      { user_id: owner, revision: 1 }
    ]);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

async function historicalProject(version) {
  const db = await supabaseProject();
  for (const relativePath of productionSources) {
    const number = Number(/\/(\d{3})-[^/]+\.sql$/.exec(relativePath)?.[1] ?? 0);
    if (relativePath.startsWith('aiao-media/') && number > version) continue;
    await db.exec(await readFile(resolve(repositoryRoot, relativePath), 'utf8'));
  }
  await db.exec(`COMMENT ON SCHEMA media_private IS 'aiao-media schema ${version}';`);
  return db;
}

test('生产增量包只含单事务与源摘要，先校验版本再执行迁移', async () => {
  for (const [name, fromVersion, toVersion] of [
    ['installation', 10, 11],
    ['credits', 11, 13],
    ['image-lifecycle', 13, 16]
  ]) {
    const bundle = await productionUpgrade(name);
    assert.equal(bundle.fromVersion, fromVersion);
    assert.equal(bundle.toVersion, toVersion);
    assert.equal((bundle.sql.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((bundle.sql.match(/^COMMIT;$/gm) ?? []).length, 1);
    assert.ok(bundle.sql.indexOf('aiao_media_upgrade_guard') < bundle.sql.indexOf('CREATE'));
    for (const source of bundle.sources) assert.ok(bundle.sql.includes(`sha256=${source.digest}`));
  }
  await assert.rejects(productionUpgrade('unknown'), /Unknown production upgrade/);
});

test('已有 schema 10 可按顺序升级至 16，重放保留原图记录、工作区与积分余额', async () => {
  const db = await historicalProject(10);
  const user = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const object = crypto.randomUUID();
  try {
    await db.query('INSERT INTO auth.users VALUES ($1)', [user]);
    await db.query('INSERT INTO public.media_workspaces (id,owner_id,request_id) VALUES ($1,$2,$3)', [
      workspace,
      user,
      crypto.randomUUID()
    ]);
    await db.query('INSERT INTO storage.objects (id,bucket_id,name,owner) VALUES ($1,$2,$3,$4)', [
      object,
      'aiao-media-images',
      `${user}/${workspace}/${crypto.randomUUID()}/${'a'.repeat(64)}.png`,
      user
    ]);
    await db.query(
      'INSERT INTO public.media_sync_records ("workspaceId","sourceId",kind,payload,"createdBy","updatedBy") VALUES ($1,$2,$3,$4,$5,$5)',
      [
        workspace,
        crypto.randomUUID(),
        'draft',
        JSON.stringify({
          version: 1,
          state: {
            document: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '升级前草稿' }] }]
            },
            fields: [],
            values: {}
          }
        }),
        user
      ]
    );
    const metadata = (await db.query('SELECT * FROM public.media_sync_records')).rows;
    const before = (await db.query('SELECT * FROM storage.objects')).rows;
    const workspaces = (await db.query('SELECT * FROM public.media_workspaces')).rows;
    for (const name of ['installation', 'credits', 'image-lifecycle']) {
      const { sql, toVersion } = await productionUpgrade(name);
      await apply(db, sql);
      if (name === 'installation')
        await db.query('INSERT INTO public.media_installation_state (admin_id) VALUES ($1)', [user]);
      if (name === 'credits') await db.query('INSERT INTO public.media_credit_accounts VALUES ($1,9,0)', [user]);
      await apply(db, sql);
      assert.equal(await schemaComment(db), `aiao-media schema ${toVersion}`);
    }
    assert.deepEqual((await db.query('SELECT * FROM storage.objects')).rows, before);
    assert.deepEqual((await db.query('SELECT * FROM public.media_sync_records')).rows, metadata);
    assert.equal((await db.query('SELECT admin_id FROM public.media_installation_state')).rows[0].admin_id, user);
    assert.deepEqual((await db.query('SELECT * FROM public.media_workspaces')).rows, workspaces);
    assert.deepEqual((await db.query('SELECT balance,reserved FROM public.media_credit_accounts')).rows, [
      { balance: 9, reserved: 0 }
    ]);
    assert.equal(
      (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.media_file_records'::regclass")).rows[0]
        .relrowsecurity,
      true
    );
    const { sql } = await productionUpgrade('credits');
    await assert.rejects(apply(db, sql), refusal(/schema version/));
    assert.equal(await schemaComment(db), 'aiao-media schema 16');
    assert.equal((await db.query('SELECT balance FROM public.media_credit_accounts')).rows[0].balance, 9);
  } finally {
    await db.close();
  }
});

test('缺失、未知或更高 schema 拒绝增量包，不覆盖版本或写入新表', async () => {
  const db = await historicalProject(10);
  try {
    const { sql } = await productionUpgrade('credits');
    for (const marker of [null, 'unknown', 'aiao-media schema 10', 'aiao-media schema 16', 'aiao-media schema 99']) {
      await db.exec(`COMMENT ON SCHEMA media_private IS ${marker === null ? 'NULL' : `'${marker}'`};`);
      await assert.rejects(apply(db, sql), refusal(/schema version/));
      assert.equal(await schemaComment(db), marker);
      assert.equal((await db.query("SELECT to_regclass('public.media_credit_accounts') AS name")).rows[0].name, null);
    }
  } finally {
    await db.close();
  }
});

test('增量中途失败时回滚所有 DDL 和版本，保留旧业务数据', async () => {
  const db = await historicalProject(11);
  try {
    await db.exec('CREATE TABLE public.media_credit_ledger (wrong_column text)');
    await db.exec("INSERT INTO public.media_credit_ledger VALUES ('kept')");
    const { sql } = await productionUpgrade('credits');
    await assert.rejects(apply(db, sql));
    assert.equal(await schemaComment(db), 'aiao-media schema 11');
    assert.equal((await db.query("SELECT to_regclass('public.media_credit_accounts') AS name")).rows[0].name, null);
    assert.deepEqual((await db.query('SELECT * FROM public.media_credit_ledger')).rows, [{ wrong_column: 'kept' }]);
  } finally {
    await db.close();
  }
});

test('版本标记匹配但缺少产品基础表时拒绝升级，不创建空的积分库', async () => {
  const db = await supabaseProject();
  try {
    await db.exec("CREATE SCHEMA media_private; COMMENT ON SCHEMA media_private IS 'aiao-media schema 11';");
    const { sql } = await productionUpgrade('credits');
    await assert.rejects(apply(db, sql), refusal(/required product tables/));
    assert.equal(await schemaComment(db), 'aiao-media schema 11');
    assert.equal((await db.query("SELECT to_regclass('public.media_credit_accounts') AS name")).rows[0].name, null);
  } finally {
    await db.close();
  }
});
