import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { blockedBy } from './image-lifecycle-local.mjs';

export async function verifyImageDeleteRace(env,userId,workspaceId) {
  const clients=Array.from({length:3},(_,index)=>new pg.Client({
    host:'127.0.0.1',port:Number(env.DB_PORT),user:index===2?'supabase_admin':'authenticator',
    password:env.POSTGRES_PASSWORD,database:'postgres',connectionTimeoutMillis:5000,query_timeout:10000
  }));
  const [a,b,observer]=clients;
  const paths=[];
  try {
    await Promise.all(clients.map(client=>client.connect()));
    for (const client of [a,b]) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[userId]);
      await client.query('SET ROLE authenticated');
    }
    const aPid=(await a.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const bPid=(await b.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const fixture=async()=>{
      const sourceId=randomUUID(),workId=randomUUID(),requestId=randomUUID(),hash='a'.repeat(64);
      const path=`${userId}/${workspaceId}/${sourceId}/${hash}.png`;
      const payload=JSON.stringify({version:1,jobId:sourceId,prompt:'删除引用竞态',modelId:'fixture',providerInstanceId:randomUUID(),mimeType:'image/png',width:1,height:1,bytes:10,sha256:hash,createdAt:new Date().toISOString()});
      await a.query(`INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload) VALUES ($1,$2,$3,'work',$4)`,[workId,workspaceId,sourceId,payload]);
      const {rows:[file]}=await a.query(`INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'uploaded') RETURNING id`,[workspaceId,sourceId,hash,path]);
      await observer.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`,[path,userId]);
      paths.push(path);
      return {sourceId,workId,requestId,path,fileId:file.id,hash};
    };
    const begin=(client,r)=>client.query('SELECT public.media_begin_image_delete($1,1,1,$2) AS value',[r.fileId,r.requestId]);
    const retain=(client,r,conflictId)=>client.query('SELECT public.media_retain_image_conflict($1,$2,$3,$4)',[workspaceId,conflictId,r.sourceId,[r.hash]]);
    const r=await fixture(),conflictId=randomUUID();
    await a.query('BEGIN');
    await begin(a,r);
    const lateReference=retain(b,r,conflictId);
    await blockedBy(observer,bPid,aPid);
    await a.query('COMMIT');
    await lateReference;
    assert.equal((await b.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[r.path])).rows.length,0);
    assert.equal((await b.query('SELECT public.media_complete_image_delete($1) AS value',[r.requestId])).rows[0].value.state,'pending');
    await b.query('SELECT public.media_release_image_conflict($1,$2,$3,1)',[workspaceId,conflictId,r.sourceId]);
    await a.query('BEGIN');
    assert.equal((await a.query('DELETE FROM storage.objects WHERE name=$1 RETURNING id',[r.path])).rows.length,1);
    const completing=b.query('SELECT public.media_complete_image_delete($1) AS value',[r.requestId]);
    await blockedBy(observer,bPid,aPid);
    await a.query('COMMIT');
    assert.equal((await completing).rows[0].value.state,'complete');
    const next=await fixture(),otherConflict=randomUUID();
    await a.query('BEGIN');
    await retain(a,next,otherConflict);
    const lateDelete=begin(b,next).then(()=>null,error=>error.code);
    await blockedBy(observer,bPid,aPid);
    await a.query('COMMIT');
    assert.equal(await lateDelete,'PT409');
    assert.equal((await b.query('SELECT deleted FROM public.media_file_records WHERE id=$1',[next.fileId])).rows[0].deleted,false);
    assert.equal((await observer.query('SELECT id FROM storage.objects WHERE name=$1',[next.path])).rows.length,1);
    console.log('PASS real PostgreSQL deletion/reference races, RLS rejection, recoverable receipt and post-commit absence verification');
  } finally {
    await Promise.allSettled([a,b].map(client=>client.query('ROLLBACK')));
    await observer.query('DELETE FROM storage.objects WHERE name=ANY($1::text[])',[paths]).catch(()=>undefined);
    await Promise.allSettled(clients.map(client=>client.end()));
  }
}
