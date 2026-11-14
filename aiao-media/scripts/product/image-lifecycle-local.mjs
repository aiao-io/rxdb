import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';

export async function blockedBy(observer, waiting, blocker) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const {
      rows: [row]
    } = await observer.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked', [blocker, waiting]);
    if (row.blocked) return;
    await setTimeout(25);
  }
  assert.fail('竞争事务未等待同一工作区的事务锁');
}

export async function verifyImageLifecycleRace(env, userId, workspaceId) {
  const clients = Array.from(
    { length: 3 },
    () =>
      new pg.Client({
        host: '127.0.0.1',
        port: Number(env.DB_PORT),
        user: 'authenticator',
        password: env.POSTGRES_PASSWORD,
        database: 'postgres',
        connectionTimeoutMillis: 5000,
        query_timeout: 10000
      })
  );
  const [remove, upload, observer] = clients;
  try {
    await Promise.all(clients.map(client => client.connect()));
    for (const client of [remove, upload]) {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
      await client.query('SET ROLE authenticated');
    }
    const removePid = (await remove.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const uploadPid = (await upload.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    for (const removalFirst of [true, false]) {
      const sourceId = randomUUID(),
        id = randomUUID(),
        digest = 'a'.repeat(64);
      const payload = JSON.stringify({
        version: 1,
        jobId: sourceId,
        prompt: '删除上传竞态',
        modelId: 'fixture',
        providerInstanceId: randomUUID(),
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 10,
        sha256: digest,
        createdAt: new Date().toISOString()
      });
      await remove.query(
        `INSERT INTO public.media_sync_records(id,"workspaceId","sourceId",kind,payload) VALUES ($1,$2,$3,'work',$4)`,
        [id, workspaceId, sourceId, payload]
      );
      const {
        rows: [file]
      } = await upload.query(
        `INSERT INTO public.media_file_records("workspaceId","sourceId",version,path,"mimeType",width,height,bytes,sha256,status) VALUES ($1,$2,$3,$4,'image/png',1,1,10,$3,'pending') RETURNING id`,
        [workspaceId, sourceId, digest, `${userId}/${workspaceId}/${sourceId}/${digest}.png`]
      );
      const deletion = () =>
        remove.query(`UPDATE public.media_sync_records SET deleted=true,revision=2,"baseRevision"=1 WHERE id=$1`, [id]);
      const completion = () =>
        upload.query(`UPDATE public.media_file_records SET status='uploaded',revision=2,"baseRevision"=1 WHERE id=$1`, [
          file.id
        ]);
      await remove.query('BEGIN');
      await upload.query('BEGIN');
      if (removalFirst) {
        await deletion();
        const late = completion().then(
          () => null,
          error => error.code
        );
        await blockedBy(observer, uploadPid, removePid);
        await remove.query('COMMIT');
        assert.equal(await late, 'PT409');
        await upload.query('ROLLBACK');
      } else {
        await completion();
        const late = deletion();
        await blockedBy(observer, removePid, uploadPid);
        await upload.query('COMMIT');
        await late;
        await remove.query('COMMIT');
      }
      const allowed = await upload.query('SELECT public.media_image_upload_allowed($1,$2,$3) AS allowed', [
        workspaceId,
        sourceId,
        digest
      ]);
      assert.equal(allowed.rows[0].allowed, false);
      assert.equal(
        (await remove.query('SELECT deleted FROM public.media_sync_records WHERE id=$1', [id])).rows[0].deleted,
        true
      );
    }
    console.log('PASS real PostgreSQL dual-connection gallery removal/upload races in both commit orders');
  } finally {
    await Promise.allSettled(
      clients.map(async client => {
        await client.query('ROLLBACK').catch(() => undefined);
        await client.end();
      })
    );
  }
}
