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
    CREATE TABLE public.rxdb_change (namespace text,entity text,"entityId" text,"branchId" text,"beforeData" jsonb,"afterData" jsonb,"snapshotComplete" boolean NOT NULL DEFAULT true);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub', true), ''), '${userId}')::uuid $$;
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

const pathFor = sourceId => `${userId}/${workspaceId}/${sourceId}/${digest}.png`;
async function work(sourceId = crypto.randomUUID()) {
  const id = crypto.randomUUID();
  const payload = JSON.stringify({
    version: 1,
    jobId: sourceId,
    prompt: '测试图片',
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
    `INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload,"createdBy","updatedBy") VALUES ($1,$2,$3,'work',$4,$5,$5)`,
    [id, workspaceId, sourceId, payload, userId]
  );
  return { id, sourceId, payload };
}
async function file(sourceId) {
  const {
    rows: [row]
  } = await db.query(
    `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status,"createdBy","updatedBy") VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'pending',$5,$5) RETURNING *`,
    [workspaceId, sourceId, digest, pathFor(sourceId), userId]
  );
  return row;
}
const remove = record =>
  db.query(
    `UPDATE public.media_sync_records SET deleted=true,revision=revision+1,"baseRevision"=revision WHERE id=$1`,
    [record.id]
  );
async function asUser(action, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await action();
  } finally {
    await db.exec('RESET ROLE');
  }
}

test('图库移除后拒绝旧 pending 提交、新文件及正确修订的作品复活', async () => {
  const record = await work();
  const pending = await file(record.sourceId);
  await remove(record);
  await assert.rejects(
    db.query(`UPDATE public.media_file_records SET status='uploaded',revision=2,"baseRevision"=1 WHERE id=$1`, [
      pending.id
    ]),
    { code: 'PT409' }
  );
  await assert.rejects(file(record.sourceId), { code: 'PT409' });
  await assert.rejects(
    db.query(`UPDATE public.media_sync_records SET deleted=false,revision=3,"baseRevision"=2 WHERE id=$1`, [record.id]),
    { code: 'PT409' }
  );
  await assert.rejects(
    db.query(
      `INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload,revision,"baseRevision","createdBy","updatedBy") VALUES ($1,$2,$3,'work',$4,3,0,$5,$5) ON CONFLICT(id) DO UPDATE SET deleted=false,revision=3,"baseRevision"=2`,
      [record.id, workspaceId, record.sourceId, record.payload, userId]
    ),
    { code: 'PT409' }
  );
  assert.equal(
    (await db.query('SELECT deleted FROM public.media_sync_records WHERE id=$1', [record.id])).rows[0].deleted,
    true
  );
  const other = await work();
  const otherFile = await file(other.sourceId);
  await db.query(`UPDATE public.media_file_records SET status='uploaded',revision=2,"baseRevision"=1 WHERE id=$1`, [
    otherFile.id
  ]);
});

test('同一文件版本的删标不可逆，身份、摘要和大小均不可改写', async () => {
  const record = await work();
  const pending = await file(record.sourceId);
  for (const field of [
    `path='${pathFor(crypto.randomUUID())}'`,
    `sha256='${'b'.repeat(64)}'`,
    `bytes=11`,
    'width=2',
    'height=2',
    `"mimeType"='image/jpeg'`
  ])
    await assert.rejects(
      db.query(`UPDATE public.media_file_records SET ${field},revision=2,"baseRevision"=1 WHERE id=$1`, [pending.id]),
      { code: '42501' }
    );
  await db.query(
    `UPDATE public.media_file_records SET deleted=true,status='deleted',revision=2,"baseRevision"=1 WHERE id=$1`,
    [pending.id]
  );
  await assert.rejects(
    db.query(
      `UPDATE public.media_file_records SET deleted=false,status='uploaded',revision=3,"baseRevision"=2 WHERE id=$1`,
      [pending.id]
    ),
    { code: 'PT409' }
  );
});

test('新文件路径必须与账号、工作区、来源、摘要及格式完全对应', async () => {
  const record = await work();
  for (const path of [
    pathFor(crypto.randomUUID()),
    pathFor(record.sourceId).replace(digest, 'b'.repeat(64)),
    pathFor(record.sourceId).replace('.png', '.jpg')
  ]) {
    await assert.rejects(
      db.query(
        `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'pending')`,
        [workspaceId, record.sourceId, digest, path]
      ),
      { code: '22023' }
    );
  }
});

test('图库移除后 Storage 拒绝写入并保留已存对象可读，不改其他作品', async () => {
  const removed = await work();
  const retained = await file(removed.sourceId);
  await asUser(() =>
    db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
      retained.path,
      userId
    ])
  );
  await remove(removed);
  await asUser(async () => {
    assert.equal((await db.query(`SELECT name FROM storage.objects WHERE name=$1`, [retained.path])).rows.length, 1);
    await assert.rejects(
      db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
        retained.path,
        userId
      ]),
      { code: '42501' }
    );
    assert.equal(
      (await db.query(`UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING id`, [retained.path])).rows
        .length,
      0
    );
  });
  const active = await work();
  const next = await file(active.sourceId);
  await asUser(() =>
    db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
      next.path,
      userId
    ])
  );
});

test('上传许可检查覆盖作品和文件删标，拒绝匿名、其他工作区及停用账号', async () => {
  const record = await work();
  const pending = await file(record.sourceId);
  const allowed = async () =>
    (
      await db.query(`SELECT public.media_image_upload_allowed($1,$2,$3) AS allowed`, [
        workspaceId,
        record.sourceId,
        digest
      ])
    ).rows[0].allowed;
  await asUser(async () => assert.equal(await allowed(), true));
  await assert.rejects(asUser(allowed, 'anon'), { code: '42501' });
  await assert.rejects(
    asUser(() =>
      db.query(`SELECT public.media_image_upload_allowed($1,$2,$3)`, [crypto.randomUUID(), record.sourceId, digest])
    ),
    { code: '42501' }
  );
  await db.query(
    `UPDATE public.media_file_records SET deleted=true,status='deleted',revision=2,"baseRevision"=1 WHERE id=$1`,
    [pending.id]
  );
  await asUser(async () => assert.equal(await allowed(), false));
  await db.query('INSERT INTO public.media_accounts(user_id,disabled) VALUES ($1,true)', [userId]);
  try {
    await assert.rejects(asUser(allowed), { code: '42501' });
  } finally {
    await db.query('DELETE FROM public.media_accounts WHERE user_id=$1', [userId]);
  }
  const capabilities = (await asUser(() => db.query('SELECT public.media_file_capabilities() AS value'))).rows[0].value;
  assert.equal(capabilities.lifecycle, 1);
});
