import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { localEnvironment } from './supabase-local.mjs';

const { env, url } = await localEnvironment();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options),
  anonymous = createClient(url, env.ANON_KEY, options);
const users = [];
const ok = result => {
  assert.equal(result.error, null);
  return result.data;
};
try {
  for (let i = 0; i < 2; i++) {
    const email = `sync-management-${randomUUID()}@example.test`,
      password = randomBytes(24).toString('hex');
    const { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    const client = createClient(url, env.ANON_KEY, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    const workspace = ok(await client.rpc('media_ensure_workspace', { p_request_id: randomUUID() }));
    const record = {
      id: randomUUID(),
      sourceId: randomUUID(),
      workspaceId: workspace.id,
      kind: 'provider',
      payload: JSON.stringify({
        version: 1,
        name: `Fixture ${i}`,
        baseUrl: 'https://provider.example.com/v1',
        model: 'fixture',
        mode: 'direct'
      }),
      revision: 1,
      baseRevision: 0,
      createdBy: user.id,
      updatedBy: user.id
    };
    ok(await client.from('media_sync_records').insert(record));
    users.push({ id: user.id, client, record });
  }
  const [a, b] = users;
  const capabilities = ok(await a.client.rpc('media_sync_capabilities'));
  assert.deepEqual(capabilities, { protocol: 1, rls: true, metadataOnly: true });
  assert.ok((await anonymous.rpc('media_sync_capabilities')).error);
  const quota = ok(await a.client.rpc('media_sync_status'));
  assert.equal(quota.records, 1);
  assert.equal(quota.recordLimit, 20000);
  assert.equal(quota.byteLimit, 67108864);
  const exported = ok(await a.client.rpc('media_export_sync'));
  assert.equal(exported.format, 'aiao-sync-metadata');
  assert.deepEqual(
    exported.records.map(record => record.id),
    [a.record.id]
  );
  assert.ok(!JSON.stringify(exported).includes(b.record.id));
  assert.deepEqual(
    ok(await b.client.rpc('media_export_sync')).records.map(record => record.id),
    [b.record.id]
  );
  const request = { p_request_id: randomUUID() };
  assert.equal(ok(await a.client.rpc('media_delete_remote_metadata', request)).affected, 1);
  assert.equal(ok(await a.client.rpc('media_delete_remote_metadata', request)).affected, 1);
  const [deleted] = ok(await a.client.from('media_sync_records').select().eq('id', a.record.id));
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.revision, 2);
  assert.equal(ok(await b.client.rpc('media_sync_status')).active, 1);
  assert.ok((await anonymous.rpc('media_export_sync')).error);
  assert.ok((await anonymous.rpc('media_delete_remote_metadata', { p_request_id: randomUUID() })).error);
  ok(await admin.from('media_accounts').update({ disabled: true }).eq('user_id', a.id));
  assert.ok((await a.client.rpc('media_export_sync')).error);
  assert.ok((await a.client.rpc('media_delete_remote_metadata', { p_request_id: randomUUID() })).error);
  console.log(
    'PASS real project compatibility, metadata quota, isolated export, idempotent logical delete and disabled-account denial'
  );
} finally {
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
}
