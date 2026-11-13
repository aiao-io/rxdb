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
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),'${userId}')::uuid $$;
    CREATE TABLE public.rxdb_change (namespace text,entity text,"entityId" text,"branchId" text,"beforeData" jsonb,"afterData" jsonb,"snapshotComplete" boolean NOT NULL DEFAULT true);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb);
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
  await db.query(`INSERT INTO public.media_workspaces(id,owner_id) VALUES ($1,$2)`, [workspaceId,userId]);
});
after(async () => db?.close());
async function asUser(operation) {
  await db.exec('SET ROLE authenticated');
  try { return await operation(); } finally { await db.exec('RESET ROLE'); }
}
async function rpc(name, args) {
  return (await asUser(() => db.query(`SELECT public.${name}(${args.map((_,index)=>`$${index+1}`).join(',')}) AS value`,args))).rows[0].value;
}
async function fixture() {
  const sourceId=crypto.randomUUID(),workId=crypto.randomUUID(),requestId=crypto.randomUUID();
  const path=`${userId}/${workspaceId}/${sourceId}/${digest}.png`;
  const payload=JSON.stringify({version:1,jobId:sourceId,prompt:'显式重新上传原图',modelId:'fixture',providerInstanceId:crypto.randomUUID(),mimeType:'image/png',width:1,height:1,bytes:10,sha256:digest,createdAt:'2026-11-14T00:00:00Z'});
  await db.query(`INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload) VALUES ($1,$2,$3,'work',$4)`,[workId,workspaceId,sourceId,payload]);
  const {rows:[file]}=await db.query(`INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'uploaded') RETURNING *`,[workspaceId,sourceId,digest,path]);
  await db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`,[path,userId]);
  return {sourceId,workId,requestId,path,file};
}
async function deletedFixture() {
  const r=await fixture();
  await rpc('media_begin_image_delete',[r.file.id,1,1,r.requestId]);
  await asUser(()=>db.query(`DELETE FROM storage.objects WHERE name=$1`,[r.path]));
  assert.equal((await rpc('media_complete_image_delete',[r.requestId])).state,'complete');
  return r;
}
const prepare=(r,requestId=crypto.randomUUID(),fileRevision=2,workRevision=1)=>rpc('media_prepare_image_reupload',[r.file.id,fileRevision,workRevision,requestId]);

test('显式重新上传分配新文件身份与路径，同一请求或同一前版本的重试复用唯一新版本',async()=>{
  const r=await deletedFixture(),requestId=crypto.randomUUID();
  const next=await prepare(r,requestId);
  assert.notEqual(next.id,r.file.id);
  assert.equal(next.version,`${digest}-${requestId}`);
  assert.equal(next.path,`${userId}/${workspaceId}/${r.sourceId}/${next.version}.png`);
  assert.equal(next.sha256,digest);
  assert.equal(next.status,'pending');
  assert.equal(next.revision,1);
  assert.equal(next.deleted,false);
  assert.deepEqual(await prepare(r,requestId),next);
  assert.deepEqual(await prepare(r),next);
  assert.equal((await db.query(`SELECT count(*) AS count FROM public.media_file_records WHERE "workspaceId"=$1 AND "sourceId"=$2`,[workspaceId,r.sourceId])).rows[0].count,2);
});

test('旧版本 tombstone 永久保留，旧上传许可与旧 Storage 路径不能因新版本建立而恢复',async()=>{
  const r=await deletedFixture(),next=await prepare(r);
  assert.equal(await rpc('media_image_upload_allowed',[workspaceId,r.sourceId,digest]),false);
  assert.equal(await rpc('media_image_upload_allowed',[workspaceId,r.sourceId,next.version]),true);
  await assert.rejects(asUser(()=>db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`,[r.path,userId])),{code:'42501'});
  await assert.rejects(db.query(`UPDATE public.media_file_records SET deleted=false,status='pending',revision=3,"baseRevision"=2 WHERE id=$1`,[r.file.id]),{code:'PT409'});
  assert.equal((await db.query('SELECT deleted FROM public.media_file_records WHERE id=$1',[r.file.id])).rows[0].deleted,true);
});

test('旧删除回执重放只确认旧对象，不能清理新版本；相同摘要的未解决冲突保护新文件',async()=>{
  const r=await deletedFixture(),conflictId=crypto.randomUUID();
  await rpc('media_retain_image_conflict',[workspaceId,conflictId,r.sourceId,[digest]]);
  const next=await prepare(r);
  await asUser(()=>db.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`,[next.path,userId]));
  await asUser(()=>db.query(`UPDATE public.media_file_records SET status='uploaded',revision=2,"baseRevision"=1 WHERE id=$1`,[next.id]));
  assert.equal((await rpc('media_begin_image_delete',[r.file.id,1,1,r.requestId])).state,'complete');
  assert.equal((await rpc('media_complete_image_delete',[r.requestId])).state,'complete');
  assert.equal((await asUser(()=>db.query(`DELETE FROM storage.objects WHERE name=$1 RETURNING name`,[next.path]))).rows.length,0);
  assert.equal((await rpc('media_preview_image_delete',[next.id])).conflictReferences,1);
  assert.equal((await db.query(`SELECT count(*) AS count FROM storage.objects WHERE name=$1`,[next.path])).rows[0].count,1);
});

test('未确认删除、图库移除、摘要改变、过期修订和无登记的伪造新版本都拒绝',async()=>{
  const active=await fixture();
  await assert.rejects(prepare(active),{code:'PT409'});
  const pending=await fixture();
  await rpc('media_begin_image_delete',[pending.file.id,1,1,pending.requestId]);
  await assert.rejects(prepare(pending),{code:'PT409'});
  const removed=await deletedFixture();
  await db.query(`UPDATE public.media_sync_records SET deleted=true,revision=2,"baseRevision"=1 WHERE id=$1`,[removed.workId]);
  await assert.rejects(prepare(removed,crypto.randomUUID(),2,2),{code:'PT409'});
  const stale=await deletedFixture();
  await assert.rejects(prepare(stale,crypto.randomUUID(),1),{code:'PT409'});
  await assert.rejects(prepare(stale,crypto.randomUUID(),2,2),{code:'PT409'});
  const version=`${digest}-${crypto.randomUUID()}`;
  const path=`${userId}/${workspaceId}/${stale.sourceId}/${version}.png`;
  await assert.rejects(asUser(()=>db.query(`INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$5,'pending')`,[workspaceId,stale.sourceId,version,path,digest])),{code:'PT409'});
});

test('另一账号与停用账号不能重新上传，请求号不能挪用于另一来源',async()=>{
  const r=await deletedFixture(),other=await deletedFixture(),requestId=crypto.randomUUID();
  await prepare(r,requestId);
  await assert.rejects(prepare(other,requestId),{code:'22023'});
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[crypto.randomUUID()]);
  try { await assert.rejects(prepare(other),{code:'42501'}); }
  finally { await db.query("SELECT set_config('request.jwt.claim.sub','',false)"); }
  await db.query('INSERT INTO public.media_accounts(user_id,disabled) VALUES ($1,true)',[userId]);
  try { await assert.rejects(prepare(other),{code:'42501'}); }
  finally { await db.query('DELETE FROM public.media_accounts WHERE user_id=$1',[userId]); }
});
