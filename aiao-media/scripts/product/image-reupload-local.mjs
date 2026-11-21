import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { blockedBy } from './image-lifecycle-local.mjs';

export async function verifyImageReuploadRace(env, userId, workspaceId) {
  const clients = Array.from(
    { length: 3 },
    (_, index) =>
      new pg.Client({
        host: '127.0.0.1',
        port: Number(env.DB_PORT),
        user: index === 2 ? 'supabase_admin' : 'authenticator',
        password: env.POSTGRES_PASSWORD,
        database: 'postgres',
        connectionTimeoutMillis: 5000,
        query_timeout: 10000
      })
  );
  const [a, b, observer] = clients;
  try {
    await Promise.all(clients.map(client => client.connect()));
    for (const client of [a, b]) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await client.query('SET ROLE authenticated');
    }
    const aPid = (await a.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const bPid = (await b.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const fixture = async () => {
      const sourceId = randomUUID(),
        workId = randomUUID(),
        requestId = randomUUID(),
        hash = 'a'.repeat(64);
      const path = `${userId}/${workspaceId}/${sourceId}/${hash}.png`;
      const payload = JSON.stringify({
        version: 1,
        jobId: sourceId,
        prompt: '显式新版本竞态',
        modelId: 'fixture',
        providerInstanceId: randomUUID(),
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 10,
        sha256: hash,
        createdAt: new Date().toISOString()
      });
      await a.query(
        `INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload) VALUES ($1,$2,$3,'work',$4)`,
        [workId, workspaceId, sourceId, payload]
      );
      const {
        rows: [file]
      } = await a.query(
        `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'uploaded') RETURNING id`,
        [workspaceId, sourceId, hash, path]
      );
      await a.query('SELECT public.media_begin_image_delete($1,1,1,$2)', [file.id, requestId]);
      assert.equal(
        (await a.query('SELECT public.media_complete_image_delete($1) AS value', [requestId])).rows[0].value.state,
        'complete'
      );
      return { sourceId, workId, fileId: file.id, hash };
    };
    const prepare = (client, r) =>
      client.query('SELECT public.media_prepare_image_reupload($1,2,1,$2) AS value', [r.fileId, randomUUID()]);
    const duplicate = await fixture();
    await a.query('BEGIN');
    const first = (await prepare(a, duplicate)).rows[0].value;
    const retry = prepare(b, duplicate);
    await blockedBy(observer, bPid, aPid);
    await a.query('COMMIT');
    assert.deepEqual((await retry).rows[0].value, first);
    assert.equal(
      (
        await a.query(
          'SELECT count(*)::integer AS count FROM public.media_file_records WHERE "workspaceId"=$1 AND "sourceId"=$2',
          [workspaceId, duplicate.sourceId]
        )
      ).rows[0].count,
      2
    );
    const removed = await fixture();
    await a.query('BEGIN');
    await a.query('UPDATE public.media_sync_records SET deleted=true,revision=2,"baseRevision"=1 WHERE id=$1', [
      removed.workId
    ]);
    const rejected = prepare(b, removed).then(
      () => null,
      error => error.code
    );
    await blockedBy(observer, bPid, aPid);
    await a.query('COMMIT');
    assert.equal(await rejected, 'PT409');
    const prepared = await fixture();
    await a.query('BEGIN');
    const pending = (await prepare(a, prepared)).rows[0].value;
    const removal = b.query(
      'UPDATE public.media_sync_records SET deleted=true,revision=2,"baseRevision"=1 WHERE id=$1',
      [prepared.workId]
    );
    await blockedBy(observer, bPid, aPid);
    await a.query('COMMIT');
    await removal;
    assert.equal(
      (
        await b.query('SELECT public.media_image_upload_allowed($1,$2,$3) AS allowed', [
          workspaceId,
          prepared.sourceId,
          pending.version
        ])
      ).rows[0].allowed,
      false
    );
    await assert.rejects(
      b.query(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('aiao-media-images',$1,$2)`, [
        pending.path,
        userId
      ]),
      { code: '42501' }
    );
    console.log(
      'PASS real PostgreSQL reupload retries reuse one version; gallery removal and preparation serialize in both commit orders'
    );
  } finally {
    await Promise.allSettled(
      clients.map(async client => {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end();
      })
    );
  }
}
