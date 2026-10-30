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
