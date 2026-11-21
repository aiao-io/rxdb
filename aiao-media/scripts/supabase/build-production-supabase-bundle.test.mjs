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
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    GRANT ALL ON auth.users TO service_role;
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
    assert.equal(first.sources.length, 26);
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
    ['image-lifecycle', 13, 16],
    ['supabase-first-admin-rxdb', 16, 21],
    ['admin-account-profile', 21, 22],
    ['config-rxdb-sync', 22, 23]
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

test('已有 schema 16 可执行 16 到 21 的 Supabase-first 增量并保证配置提交原子幂等', async () => {
  const db = await historicalProject(16);
  const actor = crypto.randomUUID();
  const workspace = crypto.randomUUID();
  const commit = crypto.randomUUID();
  const operation = crypto.randomUUID();
  const entity = crypto.randomUUID();
  try {
    await db.query('INSERT INTO auth.users VALUES ($1)', [actor]);
    await db.query('INSERT INTO public.media_workspaces (id,owner_id,request_id) VALUES ($1,$2,$3)', [
      workspace,
      actor,
      crypto.randomUUID()
    ]);
    await apply(db, (await productionUpgrade('supabase-first-admin-rxdb')).sql);
    assert.equal(await schemaComment(db), 'aiao-media schema 21');
    await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [actor]);
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor]);
    assert.deepEqual((await db.query('SELECT auth.uid() AS uid, public.media_admin_authorized() AS authorized')).rows, [
      { uid: actor, authorized: true }
    ]);

    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main','{}',$3,'首个配置提交',$4,$5,'synced')`,
      [commit, workspace, actor, operation, 'a'.repeat(64)]
    );
    await db.query(
      `INSERT INTO public.media_config_commit_changes
        (id, commit_id, sequence, entity, entity_id, operation, patch, inverse_patch, expected_revision, content_fingerprint)
       VALUES ($1,$2,1,'MediaPromptTemplate',$3,'insert',$4,$5,NULL,$6)`,
      [
        crypto.randomUUID(),
        commit,
        entity,
        JSON.stringify({ value: { key: 'hero', title: '首页', prompt: '生成海报' } }),
        JSON.stringify({ value: null }),
        'b'.repeat(64)
      ]
    );
    const first = (await db.query('SELECT public.apply_media_config_commit($1,$2) AS value', [commit, operation]))
      .rows[0].value;
    assert.equal(first.reused, false);
    assert.equal(first.revisions[0].revision, 1);
    assert.deepEqual(
      (
        await db.query(
          'SELECT revision,payload,deleted FROM public.media_config_records WHERE workspace_id=$1 AND entity_id=$2',
          [workspace, entity]
        )
      ).rows,
      [{ revision: 1, payload: { key: 'hero', title: '首页', prompt: '生成海报' }, deleted: false }]
    );
    const retry = (await db.query('SELECT public.apply_media_config_commit($1,$2) AS value', [commit, operation]))
      .rows[0].value;
    assert.equal(retry.reused, true);
    const rollbackOperation = crypto.randomUUID();
    const rollback = (
      await db.query('SELECT public.rollback_media_config_commit($1,$2) AS value', [commit, rollbackOperation])
    ).rows[0].value;
    assert.equal(rollback.status, 'rolled_back');
    assert.equal(rollback.reused, false);
    assert.deepEqual(
      (
        await db.query(
          'SELECT revision,payload,deleted FROM public.media_config_records WHERE workspace_id=$1 AND entity_id=$2',
          [workspace, entity]
        )
      ).rows,
      [{ revision: 2, payload: null, deleted: true }]
    );
    const rollbackRetry = (
      await db.query('SELECT public.rollback_media_config_commit($1,$2) AS value', [commit, rollbackOperation])
    ).rows[0].value;
    assert.equal(rollbackRetry.reused, true);
    await db.exec('SET ROLE service_role');
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM public.media_admin_audit WHERE action='config-commit-apply'"))
        .rows[0].count,
      1
    );
    const other = crypto.randomUUID();
    const otherWorkspace = crypto.randomUUID();
    const foreignCommit = crypto.randomUUID();
    const foreignOperation = crypto.randomUUID();
    await db.query('INSERT INTO auth.users VALUES ($1)', [other]);
    await db.query('INSERT INTO public.media_workspaces (id,owner_id,request_id) VALUES ($1,$2,$3)', [
      otherWorkspace,
      other,
      crypto.randomUUID()
    ]);
    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main','{}',$3,'跨工作区提交',$4,$5,'synced')`,
      [foreignCommit, otherWorkspace, actor, foreignOperation, '1'.repeat(64)]
    );
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor]);
    await assert.rejects(
      db.query('SELECT public.apply_media_config_commit($1,$2)', [foreignCommit, foreignOperation]),
      { code: '42501' }
    );

    const parentCommit = crypto.randomUUID();
    const parentOperation = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main',$3,$4,'缺失父提交',$5,$6,'synced')`,
      [parentCommit, workspace, [crypto.randomUUID()], actor, parentOperation, 'c'.repeat(64)]
    );
    await db.query(
      `INSERT INTO public.media_config_commit_changes
        (id, commit_id, sequence, entity, entity_id, operation, patch, expected_revision, content_fingerprint)
       VALUES ($1,$2,1,'MediaPromptTemplate',$3,'update',$4,1,$5)`,
      [
        crypto.randomUUID(),
        parentCommit,
        entity,
        JSON.stringify({ value: { key: 'hero', title: '不应应用' } }),
        'd'.repeat(64)
      ]
    );
    await assert.rejects(db.query('SELECT public.apply_media_config_commit($1,$2)', [parentCommit, parentOperation]), {
      code: '40001'
    });

    const conflictCommit = crypto.randomUUID();
    const conflictOperation = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main','{}',$3,'版本冲突',$4,$5,'synced')`,
      [conflictCommit, workspace, actor, conflictOperation, 'e'.repeat(64)]
    );
    await db.query(
      `INSERT INTO public.media_config_commit_changes
        (id, commit_id, sequence, entity, entity_id, operation, patch, expected_revision, content_fingerprint)
       VALUES ($1,$2,1,'MediaPromptTemplate',$3,'update',$4,0,$5)`,
      [
        crypto.randomUUID(),
        conflictCommit,
        entity,
        JSON.stringify({ value: { key: 'hero', title: '版本冲突' } }),
        'f'.repeat(64)
      ]
    );
    await assert.rejects(
      db.query('SELECT public.apply_media_config_commit($1,$2)', [conflictCommit, conflictOperation]),
      { code: '40001' }
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT revision,payload FROM public.media_config_records WHERE workspace_id=$1 AND entity_id=$2',
          [workspace, entity]
        )
      ).rows,
      [{ revision: 2, payload: null }]
    );

    const partialCommit = crypto.randomUUID();
    const partialOperation = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main','{}',$3,'部分失败回滚',$4,$5,'synced')`,
      [partialCommit, workspace, actor, partialOperation, '2'.repeat(64)]
    );
    await db.query(
      `INSERT INTO public.media_config_commit_changes
        (id, commit_id, sequence, entity, entity_id, operation, patch, expected_revision, content_fingerprint)
       VALUES
        ($1,$2,1,'MediaPromptTemplate',$3,'update',$4,1,$5),
        ($6,$2,2,'MediaPromptTemplate',$3,'update',$7,1,$8)`,
      [
        crypto.randomUUID(),
        partialCommit,
        entity,
        JSON.stringify({ value: { key: 'hero', title: '临时写入' } }),
        '3'.repeat(64),
        crypto.randomUUID(),
        JSON.stringify({ value: { key: 'hero', title: '第二步冲突' } }),
        '4'.repeat(64)
      ]
    );
    await assert.rejects(
      db.query('SELECT public.apply_media_config_commit($1,$2)', [partialCommit, partialOperation]),
      { code: '40001' }
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT revision,payload FROM public.media_config_records WHERE workspace_id=$1 AND entity_id=$2',
          [workspace, entity]
        )
      ).rows,
      [{ revision: 2, payload: null }]
    );
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

test('管理员资料支持旧账户、名称校验、CAS、幂等审计和实时权限', async t => {
  const db = await supabaseProject();
  const directory = await mkdtemp(join(tmpdir(), 'aiao-admin-profile-'));
  const owner = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const operation = '10000000-0000-4000-8000-000000000003';
  const read = async () => (await db.query('SELECT public.media_admin_profile() AS profile')).rows[0].profile;
  const save = async (name, revision, request = crypto.randomUUID()) =>
    (await db.query('SELECT public.media_admin_update_profile($1, $2, $3) AS profile', [name, revision, request]))
      .rows[0].profile;
  const identity = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec('SET ROLE authenticated');
  };
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'profile.sql'))).sql);
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [owner, other]);
    await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [owner]);
    await identity(owner);
    await t.test('无资料旧账号按 revision 0 读取', async () => {
      assert.deepEqual(await read(), {
        userId: owner,
        displayName: null,
        revision: 0,
        updatedAt: null,
        adminEnabled: true,
        accessDisabled: false
      });
    });
    await t.test('前后名称修订与成功结果原子写入审计，相同请求重放只生效一次', async () => {
      const result = await save('　小明 👩‍💻　', 0, operation);
      assert.equal(result.displayName, '小明 👩‍💻');
      assert.equal(result.revision, 1);
      assert.deepEqual(await save('小明 👩‍💻', 0, operation), result);
      await assert.rejects(save('另一个名称', 0, operation), { code: 'PT409' });
      await db.exec('RESET ROLE');
      const audit = (
        await db.query("SELECT * FROM public.media_admin_audit WHERE actor_id=$1 AND action='profile-update'", [owner])
      ).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].target_id, owner);
      assert.deepEqual(audit[0].before_data, { displayName: null, revision: 0 });
      assert.equal(audit[0].after_data.displayName, result.displayName);
      assert.equal(audit[0].after_data.revision, 1);
      assert.equal(audit[0].after_data.result, 'saved');
      await identity(owner);
    });
    await t.test('非法控制字符、空白和超长名称不会覆盖资料，Unicode 字符正确计数', async () => {
      for (const name of ['', '　 ', 'a'.repeat(41), 'a\nb', 'a\u0085b', 'a\u202eb'])
        await assert.rejects(save(name, 1), { code: '22023' });
      assert.equal((await read()).revision, 1);
      assert.equal((await save('😀'.repeat(40), 1)).revision, 2);
      await assert.rejects(save('冲突', 1), { code: 'PT409' });
      assert.equal((await read()).revision, 2);
    });
    await t.test('禁止浏览器直接改表或编辑别人的资料', async () => {
      await assert.rejects(
        db.query('UPDATE public.media_profiles SET display_name=$1 WHERE user_id=$2', ['伪造', owner]),
        { code: '42501' }
      );
      await identity(other);
      assert.deepEqual((await db.query('SELECT * FROM public.media_profiles')).rows, []);
      await assert.rejects(read(), { code: '42501' });
      await assert.rejects(save('提权', 0), { code: '42501' });
    });
    await t.test('撤销管理员或禁用产品账号后不能读取、保存或重放旧请求', async () => {
      await db.exec('RESET ROLE');
      await db.query('UPDATE public.media_admin_memberships SET enabled=false WHERE user_id=$1', [owner]);
      await identity(owner);
      await assert.rejects(read(), { code: '42501' });
      await assert.rejects(save('小明 👩‍💻', 0, operation), { code: '42501' });
      await db.exec('RESET ROLE');
      await db.query('UPDATE public.media_admin_memberships SET enabled=true WHERE user_id=$1', [owner]);
      await db.query('INSERT INTO public.media_accounts(user_id,disabled) VALUES ($1,true)', [owner]);
      await identity(owner);
      await assert.rejects(save('禁用账号', 2), { code: '42501' });
      await identity('');
      await assert.rejects(read(), { code: '42501' });
      await db.exec('SET ROLE anon');
      await assert.rejects(read(), { code: '42501' });
    });
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('已有 schema 21 可升级账户资料并安全重放，保留原管理员与资料', async () => {
  const db = await historicalProject(21);
  const userId = '10000000-0000-4000-8000-000000000001';
  try {
    await db.query('INSERT INTO auth.users VALUES ($1)', [userId]);
    await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [userId]);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
    const upgrade = await productionUpgrade('admin-account-profile');
    await apply(db, upgrade.sql);
    assert.equal((await db.query('SELECT count(*) FROM public.media_profiles')).rows[0].count, 1);
    await db.query('SELECT public.media_admin_update_profile($1,0,$2)', ['保留名称', crypto.randomUUID()]);
    await apply(db, upgrade.sql);
    assert.equal(await schemaComment(db), 'aiao-media schema 22');
    assert.equal(
      (await db.query('SELECT public.media_admin_profile() AS profile')).rows[0].profile.displayName,
      '保留名称'
    );
    assert.equal((await db.query('SELECT count(*) FROM public.media_admin_audit')).rows[0].count, 1);
  } finally {
    await db.close();
  }
});

/** 以普通 JWT 身份执行后续语句；空字符串表示匿名会话。 */
async function actAs(db, userId) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec('SET ROLE authenticated');
}

/** 以服务端身份准备一个管理员及其工作区。 */
async function seedAdmin(db, { admin = true } = {}) {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO auth.users VALUES ($1)', [userId]);
  await db.query('INSERT INTO public.media_workspaces (id,owner_id,request_id) VALUES ($1,$2,$3)', [
    workspaceId,
    userId,
    crypto.randomUUID()
  ]);
  if (admin) await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [userId]);
  return { userId, workspaceId };
}

async function insertProjection(
  db,
  { workspaceId, authorId, changeCount = 1, status = 'prepared', id = crypto.randomUUID() }
) {
  await db.query(
    `INSERT INTO public.media_config_projection_commits
      (id, "workspaceId", "branchId", "parentIds", "authorId", message, "operationId", "contentFingerprint", "changeCount", status, "createdBy", "updatedBy")
     VALUES ($1,$2,'main','{}',$3,'配置提交',$4,$5,$6,$7,$8,$8)`,
    [id, workspaceId, authorId, crypto.randomUUID(), 'a'.repeat(64), changeCount, status, authorId]
  );
  return id;
}

async function insertProjectionChange(
  db,
  { workspaceId, commitId, sequence, entityId, authorId, operation = 'insert', expected = null }
) {
  await db.query(
    `INSERT INTO public.media_config_projection_changes
      (id, "workspaceId", "commitId", sequence, entity, "entityId", operation, patch, "inversePatch", "expectedRevision", "contentFingerprint", "createdBy", "updatedBy")
     VALUES ($1,$2,$3,$4,'MediaPromptTemplate',$5,$6,$7,NULL,$8,$9,$10::text,$10::text)`,
    [
      crypto.randomUUID(),
      workspaceId,
      commitId,
      sequence,
      entityId,
      operation,
      JSON.stringify({ value: { key: `hero-${sequence}`, title: '首页', prompt: '生成海报' } }),
      expected,
      'b'.repeat(64),
      authorId
    ]
  );
}

test('已有 schema 22 可升级配置同步：旧投影迁入 RxDB 形状的新表，重放不重复且旧表停止接收写入', async () => {
  const db = await historicalProject(22);
  try {
    const { userId, workspaceId } = await seedAdmin(db);
    const commit = crypto.randomUUID();
    const orphan = crypto.randomUUID();
    const entity = crypto.randomUUID();
    await db.query(
      `INSERT INTO public.media_config_commits
        (id, workspace_id, branch_id, parent_ids, author_id, message, operation_id, content_fingerprint, status)
       VALUES ($1,$2,'main','{}',$3,'旧投影',$4,$5,'synced'), ($6,$2,'main','{}',$3,'未写完的旧投影',$7,$5,'prepared')`,
      [commit, workspaceId, userId, crypto.randomUUID(), 'c'.repeat(64), orphan, crypto.randomUUID()]
    );
    await db.query(
      `INSERT INTO public.media_config_commit_changes
        (id, commit_id, sequence, entity, entity_id, operation, patch, inverse_patch, expected_revision, content_fingerprint)
       VALUES ($1,$2,1,'MediaPromptTemplate',$3,'insert',$4,NULL,NULL,$5)`,
      [
        crypto.randomUUID(),
        commit,
        entity,
        JSON.stringify({ value: { key: 'hero', title: '首页', prompt: '生成海报' } }),
        'd'.repeat(64)
      ]
    );
    const upgrade = await productionUpgrade('config-rxdb-sync');
    await apply(db, upgrade.sql);
    await apply(db, upgrade.sql);
    assert.equal(await schemaComment(db), 'aiao-media schema 23');
    assert.deepEqual(
      (await db.query('SELECT id, "workspaceId", "changeCount", status FROM public.media_config_projection_commits'))
        .rows,
      [{ id: commit, workspaceId, changeCount: 1, status: 'synced' }]
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT "workspaceId", "commitId", sequence, "entityId" FROM public.media_config_projection_changes'
        )
      ).rows,
      [{ workspaceId, commitId: commit, sequence: 1, entityId: entity }]
    );
    await actAs(db, userId);
    await assert.rejects(
      db.query(
        `INSERT INTO public.media_config_commits (workspace_id, branch_id, author_id, message, operation_id, content_fingerprint)
         VALUES ($1,'main',$2,'旧表写入',$3,$4)`,
        [workspaceId, userId, crypto.randomUUID(), 'e'.repeat(64)]
      ),
      { code: '42501' }
    );
    const applied = (
      await db.query('SELECT public.apply_media_config_commit($1,$2) AS value', [
        commit,
        (await db.query('SELECT "operationId" FROM public.media_config_projection_commits WHERE id=$1', [commit]))
          .rows[0].operationId
      ])
    ).rows[0].value;
    assert.equal(applied.status, 'applied');
    assert.deepEqual(
      (await db.query('SELECT status FROM public.media_config_projection_commits WHERE id=$1', [commit])).rows,
      [{ status: 'applied' }]
    );
  } finally {
    await db.close();
  }
});

test('配置投影新表：客户端只写 prepared、变更到齐才标记 synced，应用与回滚只经服务端 RPC', async t => {
  const db = await supabaseProject();
  const directory = await mkdtemp(join(tmpdir(), 'aiao-config-projection-'));
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'bootstrap.sql'))).sql);
    assert.equal(await schemaComment(db), 'aiao-media schema 23');
    const owner = await seedAdmin(db);
    const stranger = await seedAdmin(db, { admin: false });
    const entity = crypto.randomUUID();
    await actAs(db, owner.userId);
    let commit;
    await t.test('新提交必须以 prepared 起步，不能直接写成已应用', async () => {
      await assert.rejects(
        insertProjection(db, { workspaceId: owner.workspaceId, authorId: owner.userId, status: 'applied' }),
        { code: '42501' }
      );
      commit = await insertProjection(db, { workspaceId: owner.workspaceId, authorId: owner.userId, changeCount: 2 });
    });
    await t.test('变更未到齐时拒绝标记 synced，变更工作区必须与提交一致', async () => {
      await insertProjectionChange(db, {
        ...owner,
        workspaceId: owner.workspaceId,
        commitId: commit,
        sequence: 1,
        entityId: entity,
        authorId: owner.userId
      });
      await assert.rejects(
        db.query("UPDATE public.media_config_projection_commits SET status='synced' WHERE id=$1", [commit]),
        { code: '22023' }
      );
      await assert.rejects(
        insertProjectionChange(db, {
          workspaceId: stranger.workspaceId,
          commitId: commit,
          sequence: 2,
          entityId: entity,
          authorId: owner.userId
        }),
        error => ['42501', '23503'].includes(error?.code)
      );
      await insertProjectionChange(db, {
        workspaceId: owner.workspaceId,
        commitId: commit,
        sequence: 2,
        entityId: crypto.randomUUID(),
        authorId: owner.userId
      });
      await db.query("UPDATE public.media_config_projection_commits SET status='synced' WHERE id=$1", [commit]);
    });
    await t.test('已同步的提交不可追加变更、改内容或越级推进状态', async () => {
      await assert.rejects(
        insertProjectionChange(db, {
          workspaceId: owner.workspaceId,
          commitId: commit,
          sequence: 3,
          entityId: entity,
          authorId: owner.userId
        }),
        { code: '42501' }
      );
      await assert.rejects(
        db.query('UPDATE public.media_config_projection_commits SET "contentFingerprint"=$2 WHERE id=$1', [
          commit,
          'f'.repeat(64)
        ]),
        { code: '42501' }
      );
      for (const status of ['validated', 'applied', 'released', 'rejected'])
        await assert.rejects(
          db.query('UPDATE public.media_config_projection_commits SET status=$2 WHERE id=$1', [commit, status]),
          { code: '42501' }
        );
      await assert.rejects(db.query('DELETE FROM public.media_config_projection_commits WHERE id=$1', [commit]), {
        code: '42501'
      });
      await assert.rejects(
        db.query('UPDATE public.media_config_projection_changes SET patch=\'{}\' WHERE "commitId"=$1', [commit]),
        { code: '42501' }
      );
    });
    await t.test('服务端 RPC 原子应用并推进状态，updatedAt 前进供查询缓存刷新，回滚幂等', async () => {
      const before = (
        await db.query('SELECT "updatedAt", "operationId" FROM public.media_config_projection_commits WHERE id=$1', [
          commit
        ])
      ).rows[0];
      const applied = (
        await db.query('SELECT public.apply_media_config_commit($1,$2) AS value', [commit, before.operationId])
      ).rows[0].value;
      assert.equal(applied.status, 'applied');
      assert.equal(applied.revisions.length, 2);
      const after = (
        await db.query(
          'SELECT status, "appliedAt", "updatedAt" FROM public.media_config_projection_commits WHERE id=$1',
          [commit]
        )
      ).rows[0];
      assert.equal(after.status, 'applied');
      assert.ok(after.appliedAt instanceof Date);
      assert.ok(after.updatedAt.getTime() >= before.updatedAt.getTime());
      assert.deepEqual(
        (
          await db.query(
            'SELECT revision, deleted FROM public.media_config_records WHERE workspace_id=$1 AND entity_id=$2',
            [owner.workspaceId, entity]
          )
        ).rows,
        [{ revision: 1, deleted: false }]
      );
      const rollback = crypto.randomUUID();
      assert.equal(
        (await db.query('SELECT public.rollback_media_config_commit($1,$2) AS value', [commit, rollback])).rows[0].value
          .reused,
        false
      );
      assert.equal(
        (await db.query('SELECT public.rollback_media_config_commit($1,$2) AS value', [commit, rollback])).rows[0].value
          .reused,
        true
      );
    });
    await t.test('版本冲突以 PT409 返回：PostgREST 直接给 409，不把业务冲突当成序列化失败重试', async () => {
      const existing = crypto.randomUUID();
      await db.exec('RESET ROLE');
      await db.query(
        `INSERT INTO public.media_config_records (workspace_id, branch_id, entity, entity_id, revision, payload, deleted, updated_by)
         VALUES ($1,'main','MediaPromptTemplate',$2,1,$3,false,$4)`,
        [owner.workspaceId, existing, JSON.stringify({ key: 'other-device' }), owner.userId]
      );
      await actAs(db, owner.userId);
      const conflicting = await insertProjection(db, { workspaceId: owner.workspaceId, authorId: owner.userId });
      await insertProjectionChange(db, {
        workspaceId: owner.workspaceId,
        commitId: conflicting,
        sequence: 1,
        entityId: existing,
        authorId: owner.userId
      });
      await db.query("UPDATE public.media_config_projection_commits SET status='synced' WHERE id=$1", [conflicting]);
      const operation = (
        await db.query('SELECT "operationId" FROM public.media_config_projection_commits WHERE id=$1', [conflicting])
      ).rows[0].operationId;
      await assert.rejects(db.query('SELECT public.apply_media_config_commit($1,$2)', [conflicting, operation]), {
        code: 'PT409'
      });
      assert.equal(
        (await db.query('SELECT status FROM public.media_config_projection_commits WHERE id=$1', [conflicting])).rows[0]
          .status,
        'synced'
      );
    });
    await t.test('其他账号看不到也写不进别人的投影', async () => {
      await actAs(db, stranger.userId);
      assert.deepEqual((await db.query('SELECT id FROM public.media_config_projection_commits')).rows, []);
      await assert.rejects(insertProjection(db, { workspaceId: stranger.workspaceId, authorId: stranger.userId }), {
        code: '42501'
      });
    });
    await t.test('删除工作区所有者账号时级联清理投影与应用结果，不被外键挡住', async () => {
      await db.exec('RESET ROLE');
      await db.query('DELETE FROM auth.users WHERE id=$1', [owner.userId]);
      assert.deepEqual((await db.query('SELECT id FROM public.media_config_projection_commits')).rows, []);
      assert.deepEqual(
        (await db.query('SELECT entity_id FROM public.media_config_records WHERE workspace_id=$1', [owner.workspaceId]))
          .rows,
        []
      );
    });
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('配置实体表按工作区授权，变更日志只向本工作区管理员公开，身份字段不可改', async t => {
  const db = await supabaseProject();
  const directory = await mkdtemp(join(tmpdir(), 'aiao-config-entities-'));
  try {
    await apply(db, (await buildProductionBundle(join(directory, 'bootstrap.sql'))).sql);
    const owner = await seedAdmin(db);
    const peer = await seedAdmin(db);
    const template = crypto.randomUUID();
    const visibleChanges = async () =>
      (
        await db.query(
          `SELECT type, "entityId" FROM public.rxdb_change WHERE namespace='public' AND entity='MediaPromptTemplate' ORDER BY id`
        )
      ).rows;
    await actAs(db, owner.userId);
    await t.test('管理员只能在自己的工作区写配置', async () => {
      await db.query(
        `INSERT INTO public.media_prompt_templates (id, "workspaceId", key, title, prompt, tags, "createdBy", "updatedBy")
         VALUES ($1,$2,'hero','首页','生成海报','{media}',$3::text,$3::text)`,
        [template, owner.workspaceId, owner.userId]
      );
      await assert.rejects(
        db.query(
          `INSERT INTO public.media_prompt_templates (id, "workspaceId", key, title, prompt, "createdBy", "updatedBy")
           VALUES ($1,$2,'hero','越权','x',$3::text,$3::text)`,
          [crypto.randomUUID(), peer.workspaceId, owner.userId]
        ),
        { code: '42501' }
      );
      await db.query(
        `INSERT INTO public.media_provider_policies (id, "workspaceId", key, providers, "createdBy", "updatedBy") VALUES ($1,$2,'default','[]',$3::text,$3::text)`,
        [crypto.randomUUID(), owner.workspaceId, owner.userId]
      );
      await db.query(
        `INSERT INTO public.media_platform_models (id, "workspaceId", "providerId", "modelId", "displayName", "createdBy", "updatedBy")
         VALUES ($1,$2,'platform','image-1','图片模型',$3::text,$3::text)`,
        [crypto.randomUUID(), owner.workspaceId, owner.userId]
      );
    });
    await t.test('写入经同步触发器进入变更日志，只有本工作区管理员可读', async () => {
      await db.query('UPDATE public.media_prompt_templates SET title=$2 WHERE id=$1', [template, '新首页']);
      assert.deepEqual(await visibleChanges(), [
        { type: 'INSERT', entityId: template },
        { type: 'UPDATE', entityId: template }
      ]);
      await actAs(db, peer.userId);
      assert.deepEqual(await visibleChanges(), []);
      assert.deepEqual((await db.query('SELECT id FROM public.media_prompt_templates')).rows, []);
      await actAs(db, owner.userId);
    });
    await t.test('工作区与创建者不可改，删除日志仍可被本工作区读到', async () => {
      await assert.rejects(
        db.query('UPDATE public.media_prompt_templates SET "workspaceId"=$2 WHERE id=$1', [template, peer.workspaceId]),
        error => ['42501'].includes(error?.code)
      );
      await db.query('DELETE FROM public.media_prompt_templates WHERE id=$1', [template]);
      assert.deepEqual(
        (await visibleChanges()).map(row => row.type),
        ['INSERT', 'UPDATE', 'DELETE']
      );
    });
    await t.test('撤销管理员后看不到配置与日志', async () => {
      await db.exec('RESET ROLE');
      await db.query('UPDATE public.media_admin_memberships SET enabled=false WHERE user_id=$1', [owner.userId]);
      await actAs(db, owner.userId);
      assert.deepEqual(await visibleChanges(), []);
      assert.deepEqual((await db.query('SELECT id FROM public.media_provider_policies')).rows, []);
    });
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
