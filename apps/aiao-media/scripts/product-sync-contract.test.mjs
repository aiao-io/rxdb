import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { ownedStudioPrompt } from '../src/local-data/studio-draft.ts';

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
let db;
before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${userId}'::uuid $$;
    INSERT INTO auth.users VALUES ('${userId}');
  `);
  const directory = new URL('../infra/supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).sort()) {
    if (/^(001|003)-/.test(name) || !name.endsWith('.sql')) continue;
    await db.exec(await readFile(new URL(name, directory), 'utf8'));
  }
  await db.query('INSERT INTO public.media_workspaces(id,owner_id,request_id) VALUES ($1,$2,$1)', [
    workspaceId,
    userId
  ]);
});
after(async () => {
  await db?.close();
});

test('首次同步接受多次离线编辑压缩后的 INSERT，后续更新仍执行 CAS', async () => {
  const id = crypto.randomUUID();
  const payload = JSON.stringify({
    version: 1,
    name: '最后一次保存',
    baseUrl: 'https://provider.example/v1',
    model: 'fixture',
    mode: 'direct'
  });
  await db.query(
    `INSERT INTO public.media_sync_records(id,"workspaceId",kind,payload,revision,"baseRevision","createdBy","updatedBy") VALUES ($1,$2,'provider',$3,3,0,$4,$4)`,
    [id, workspaceId, payload, userId]
  );
  await db.query('UPDATE public.media_sync_records SET revision=5,"baseRevision"=3 WHERE id=$1', [id]);
  await assert.rejects(db.query('UPDATE public.media_sync_records SET revision=6,"baseRevision"=3 WHERE id=$1', [id]), {
    code: 'PT409'
  });
  await assert.rejects(
    db.query(
      `INSERT INTO public.media_sync_records(id,"workspaceId",kind,payload,revision,"baseRevision","createdBy","updatedBy") VALUES ($1,$2,'provider',$3,3,1,$4,$4)`,
      [crypto.randomUUID(), workspaceId, payload, userId]
    ),
    { code: '22023' }
  );
});

test('图片文件记录只用 INSERT 建初始修订，状态推进必须走带修订条件的 UPDATE', async () => {
  const sourceId = crypto.randomUUID();
  const digest = 'b'.repeat(64);
  const columns = `"workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status,"createdBy","updatedBy"`;
  const file = [workspaceId, sourceId, digest, `${userId}/${workspaceId}/${sourceId}/${digest}.png`, userId];
  const insert = () =>
    db.query(
      `INSERT INTO public.media_file_records(${columns}) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'pending',$5,$5) RETURNING id, revision`,
      file
    );
  const {
    rows: [created]
  } = await insert();
  assert.equal(Number(created.revision), 1);
  // PostgREST 的 upsert 是 INSERT … ON CONFLICT DO UPDATE：BEFORE INSERT 触发器先于冲突判定，后续修订被当成非法初始修订。
  await assert.rejects(
    db.query(
      `INSERT INTO public.media_file_records(id,revision,"baseRevision",${columns}) VALUES ($6,2,1,$1,$2,$3,$4,'image/png',1,1,10,$3,'uploaded',$5,$5)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, revision = EXCLUDED.revision, "baseRevision" = EXCLUDED."baseRevision"`,
      [...file, created.id]
    ),
    { code: '22023' }
  );
  // 客户端的 PATCH ?id=eq.&revision=eq. 即带修订条件的 UPDATE。
  const {
    rows: [uploaded]
  } = await db.query(
    `UPDATE public.media_file_records SET status='uploaded', revision=2, "baseRevision"=1 WHERE id=$1 AND revision=1 RETURNING status, revision`,
    [created.id]
  );
  assert.deepEqual({ ...uploaded, revision: Number(uploaded.revision) }, { status: 'uploaded', revision: 2 });
  await assert.rejects(
    db.query(`UPDATE public.media_file_records SET status='needs_review', revision=2, "baseRevision"=1 WHERE id=$1`, [
      created.id
    ]),
    { code: 'PT409' }
  );
  // 同一版本只能有一条记录：并发建记录的另一设备拿到唯一约束冲突（PostgREST 409）后改用已有记录。
  await assert.rejects(insert(), { code: '23505' });
});

const studio = text => ({
  document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  fields: [],
  values: {}
});
test('PostgreSQL 与客户端对草稿版本、总字数和 Unicode 边界作出相同判定', async () => {
  const samples = [
    studio('有效草稿'),
    { ...studio('模板'), templateVersion: 1 },
    { ...studio('模板'), templateVersion: 1.5 },
    { ...studio('模板'), templateVersion: 9007199254740992 },
    { ...studio('模板'), templateVersion: null },
    { ...studio('画幅'), aspectRatio: null },
    studio('a'.repeat(100000)),
    studio('a'.repeat(100001)),
    studio('😀'.repeat(50000)),
    studio('😀'.repeat(50001)),
    {
      ...studio('字段'),
      fields: [{ id: 'name', label: '\t', defaultValue: '', required: false }],
      values: { name: '' }
    },
    {
      ...studio('字段'),
      fields: [{ id: 'name', label: '😀'.repeat(21), defaultValue: '', required: false }],
      values: { name: '' }
    },
    {
      ...studio('值'),
      fields: [{ id: 'name', label: 'name', defaultValue: '', required: false }],
      values: { name: '😀'.repeat(2000) }
    },
    {
      ...studio('值'),
      fields: [{ id: 'name', label: 'name', defaultValue: '', required: false }],
      values: { name: '😀'.repeat(2001) }
    }
  ];
  for (const sample of samples) {
    let clientValid = true;
    try {
      ownedStudioPrompt(sample);
    } catch {
      clientValid = false;
    }
    const { rows } = await db.query('SELECT media_private.valid_studio($1::jsonb) AS valid', [JSON.stringify(sample)]);
    assert.equal(
      rows[0].valid,
      clientValid,
      `templateVersion=${sample.templateVersion}, textLength=${sample.document.content[0].content[0].text.length}`
    );
  }
});
