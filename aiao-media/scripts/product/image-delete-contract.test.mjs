import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const digest = 'a'.repeat(64);
let db;
before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),'${userId}')::uuid $$;
    CREATE TABLE public.rxdb_change (namespace text,entity text,"entityId" text,"branchId" text,"beforeData" jsonb,"afterData" jsonb,"snapshotComplete" boolean NOT NULL DEFAULT true);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    INSERT INTO auth.users VALUES ('${userId}');
  `);
  const directory = new URL('../../infra/supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).sort()) {
    if (/^(001|003)-/.test(name) || !name.endsWith('.sql')) continue;
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  await db.query('INSERT INTO public.media_workspaces(id,owner_id,request_id) VALUES ($1,$2,$1)', [
    workspaceId,
    userId
  ]);
});
after(async () => db?.close());
async function asUser(action, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await action();
  } finally {
    await db.exec('RESET ROLE');
  }
}
async function fixture(status = 'uploaded') {
  const sourceId = crypto.randomUUID(),
    id = crypto.randomUUID();
  const payload = JSON.stringify({
    version: 1,
    jobId: sourceId,
    prompt: '远端删除测试',
    modelId: 'fixture',
    providerInstanceId: crypto.randomUUID(),
    mimeType: 'image/png',
    width: 1,
    height: 1,
    bytes: 10,
    sha256: digest,
    createdAt: '2026-11-14T00:00:00.000Z'
  });
  await db.query(
    `INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload) VALUES ($1,$2,$3,'work',$4)`,
    [id, workspaceId, sourceId, payload]
  );
  const path = `${userId}/${workspaceId}/${sourceId}/${digest}.png`;
  const {
    rows: [file]
  } = await db.query(
    `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,$5) RETURNING *`,
    [workspaceId, sourceId, digest, path, status]
  );
  await db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
    path,
    userId
  ]);
  return { file, workId: id, payload, sourceId, path, requestId: crypto.randomUUID() };
}
const rpc = async (name, parameters) =>
  asUser(
    async () =>
      (
        await db.query(
          `SELECT public.${name}(${parameters.map((_, index) => `$${index + 1}`).join(',')}) AS value`,
          parameters
        )
      ).rows[0].value
  );
const preview = r => rpc('media_preview_image_delete', [r.file.id]);
const begin = (r, fileRevision = 1, workRevision = 1) =>
  rpc('media_begin_image_delete', [r.file.id, fileRevision, workRevision, r.requestId]);
const complete = r => rpc('media_complete_image_delete', [r.requestId]);

test('先文件删标再 Storage 删除，回执只有核对对象不存在后才能完成；图库信息保持', async () => {
  const r = await fixture();
  const p = await preview(r);
  assert.equal(p.allowed, true);
  assert.equal(p.file.id, r.file.id);
  assert.equal(p.workRevision, 1);
  assert.equal(p.retainedReferences, 0);
  assert.equal(
    (await asUser(() => db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id', [r.path]))).rows.length,
    0
  );
  const receipt = await begin(r);
  assert.equal(receipt.state, 'pending');
  assert.equal(receipt.fileId, r.file.id);
  assert.equal(receipt.path, r.path);
  const {
    rows: [file]
  } = await db.query('SELECT status,deleted,revision FROM public.media_file_records WHERE id=$1', [r.file.id]);
  assert.deepEqual({ ...file, revision: Number(file.revision) }, { status: 'deleted', deleted: true, revision: 2 });
  assert.equal((await complete(r)).state, 'pending');
  assert.equal(
    (await asUser(() => db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id', [r.path]))).rows.length,
    1
  );
  assert.equal((await complete(r)).state, 'complete');
  assert.deepEqual(await complete(r), await complete(r));
  assert.equal(
    (await db.query('SELECT deleted FROM public.media_sync_records WHERE id=$1', [r.workId])).rows[0].deleted,
    false
  );
});

test('预览与确认间任何文件或作品修订变化都拒绝删除，不能凭过时确认释放关联', async () => {
  const r = await fixture();
  await db.query(`UPDATE public.media_sync_records SET revision=2,"baseRevision"=1 WHERE id=$1`, [r.workId]);
  await assert.rejects(begin(r), { code: 'PT409' });
  await assert.rejects(begin(r, 2, 2), { code: 'PT409' });
  assert.equal(
    (await db.query('SELECT deleted FROM public.media_file_records WHERE id=$1', [r.file.id])).rows[0].deleted,
    false
  );
  assert.equal((await db.query('SELECT id FROM storage.objects WHERE name=$1', [r.path])).rows.length, 1);
});

test('未知删除回执重放使用同一不可变身份，不重复推进修订、不允许请求号挪到其他文件', async () => {
  const r = await fixture(),
    other = await fixture();
  const first = await begin(r);
  assert.deepEqual(await begin(r), first);
  await assert.rejects(begin({ ...other, requestId: r.requestId }), { code: '22023' });
  const current = await db.query('SELECT revision FROM public.media_file_records WHERE id=$1', [r.file.id]);
  assert.equal(Number(current.rows[0].revision), 2);
  assert.equal((await db.query('SELECT id FROM storage.objects WHERE name=$1', [other.path])).rows.length, 1);
});

test('待核对传输、保留版本与已登记冲突引用都拒绝物理删除，冲突显式解决后才放行', async () => {
  const pending = await fixture('needs_review');
  assert.equal((await preview(pending)).allowed, false);
  await assert.rejects(begin(pending), { code: 'PT409' });
  const r = await fixture(),
    conflictId = crypto.randomUUID();
  await rpc('media_retain_image_conflict', [workspaceId, conflictId, r.sourceId, [digest]]);
  const p = await preview(r);
  assert.equal(p.allowed, false);
  assert.equal(p.conflictReferences, 1);
  await assert.rejects(begin(r), { code: 'PT409' });
  await rpc('media_release_image_conflict', [workspaceId, conflictId, r.sourceId, 1]);
  assert.equal((await preview(r)).allowed, true);
  const changed = JSON.stringify({ ...JSON.parse(r.payload), sha256: 'b'.repeat(64) });
  await db.query(`UPDATE public.media_sync_records SET payload=$2,revision=2,"baseRevision"=1 WHERE id=$1`, [
    r.workId,
    changed
  ]);
  assert.equal((await preview(r)).retainedReferences, 1);
  await assert.rejects(begin(r, 1, 2), { code: 'PT409' });
});

test('删除准备后新保留引用会阻止 Storage 清理，保留对象和待恢复回执', async () => {
  const r = await fixture();
  await begin(r);
  const changed = JSON.stringify({ ...JSON.parse(r.payload), sha256: 'c'.repeat(64) });
  await db.query(`UPDATE public.media_sync_records SET payload=$2,revision=2,"baseRevision"=1 WHERE id=$1`, [
    r.workId,
    changed
  ]);
  assert.equal(
    (await asUser(() => db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id', [r.path]))).rows.length,
    0
  );
  assert.equal((await complete(r)).state, 'pending');
});

test('匿名、其他账号与已停用账号不能预览、确认或完成删除，回执不能直接改写', async () => {
  const r = await fixture();
  await assert.rejects(
    asUser(() => db.query('SELECT public.media_preview_image_delete($1)', [r.file.id]), 'anon'),
    { code: '42501' }
  );
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [crypto.randomUUID()]);
  try {
    await assert.rejects(preview(r), { code: '42501' });
  } finally {
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  }
  await db.query('INSERT INTO public.media_accounts(user_id,disabled) VALUES ($1,true)', [userId]);
  try {
    await assert.rejects(begin(r), { code: '42501' });
  } finally {
    await db.query('DELETE FROM public.media_accounts WHERE user_id=$1', [userId]);
  }
  await begin(r);
  await assert.rejects(
    asUser(() => db.query(`UPDATE public.media_image_deletions SET state='complete' WHERE id=$1`, [r.requestId])),
    { code: '42501' }
  );
});

test('不完整历史拒绝删除；迁移回填保留旧摘要且重复执行不丢已有引用', async () => {
  const opaque = await fixture();
  await db.query(
    `INSERT INTO public.rxdb_change(namespace,entity,"entityId","branchId","snapshotComplete") VALUES ('public','MediaSyncRecord',$1,'main',false)`,
    [opaque.workId]
  );
  assert.equal((await preview(opaque)).unknownHistory, 1);
  await assert.rejects(begin(opaque), { code: 'PT409' });
  const r = await fixture();
  const oldPayload = JSON.stringify({ ...JSON.parse(r.payload), sha256: 'b'.repeat(64) });
  await db.query(
    `INSERT INTO public.rxdb_change(namespace,entity,"entityId","branchId","beforeData","afterData","snapshotComplete") VALUES ('public','MediaSyncRecord',$1,'main',$2,$3,true)`,
    [
      r.workId,
      JSON.stringify({ kind: 'work', payload: oldPayload }),
      JSON.stringify({ kind: 'work', payload: r.payload })
    ]
  );
  const migration = await readFile(
    new URL('../../infra/supabase/migrations/015-image-delete.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(
    (
      await db.query(
        `SELECT count(*) AS count FROM media_private.image_references WHERE source_id=$1 AND sha256=$2 AND kind='retained'`,
        [r.sourceId, 'b'.repeat(64)]
      )
    ).rows[0].count,
    1
  );
  assert.equal((await preview(r)).allowed, true);
});

test('冲突解决时远端修订改变不释放引用，上传未发生的冲突摘要也会绑定未来文件', async () => {
  const r = await fixture(),
    conflictId = crypto.randomUUID(),
    nextHash = 'd'.repeat(64);
  await rpc('media_retain_image_conflict', [workspaceId, conflictId, r.sourceId, [digest, nextHash]]);
  await assert.rejects(rpc('media_release_image_conflict', [workspaceId, conflictId, r.sourceId, 2]), {
    code: 'PT409'
  });
  assert.equal((await preview(r)).conflictReferences, 1);
  const path = `${userId}/${workspaceId}/${r.sourceId}/${nextHash}.png`;
  const {
    rows: [file]
  } = await db.query(
    `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'uploaded') RETURNING id`,
    [workspaceId, r.sourceId, nextHash, path]
  );
  assert.equal((await rpc('media_preview_image_delete', [file.id])).conflictReferences, 1);
  await rpc('media_release_image_conflict', [workspaceId, conflictId, r.sourceId, 1]);
  assert.equal((await rpc('media_preview_image_delete', [file.id])).conflictReferences, 0);
});

test('标为完整但缺失或损坏的历史快照仍拒绝物理删除，不猜测旧文件引用', async () => {
  const r = await fixture();
  await db.query(
    `INSERT INTO public.rxdb_change(namespace,entity,"entityId","branchId","beforeData","snapshotComplete") VALUES ('public','MediaSyncRecord',$1,'main',$2,true)`,
    [r.workId, JSON.stringify({ kind: 'work', payload: 'broken JSON' })]
  );
  assert.equal((await preview(r)).unknownHistory, 1);
  await assert.rejects(begin(r), { code: 'PT409' });
});

test('RxDB 创建日志的 JSON null 前值是明确缺席，合法完整快照不被误判为未知历史', async () => {
  const r = await fixture();
  await db.query(
    `INSERT INTO public.rxdb_change(namespace,entity,"entityId","branchId","beforeData","afterData","snapshotComplete") VALUES ('public','MediaSyncRecord',$1,'main','null'::jsonb,$2,true)`,
    [r.workId, JSON.stringify({ kind: 'work', payload: r.payload })]
  );
  assert.equal((await preview(r)).unknownHistory, 0);
  assert.equal((await preview(r)).allowed, true);
  await begin(r);
});
