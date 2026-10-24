import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { handleAdmin } from '../deploy/admin-api.mjs';
import { localEnvironment } from './supabase-local.mjs';

const { env, url } = await localEnvironment();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);
const anonymous = createClient(url, env.ANON_KEY, options);
const users = [];
const templateId = `local-${randomUUID()}`;
const ok = (result, label) => {
  assert.equal(result.error, null, label);
  return result.data;
};
try {
  for (let i = 0; i < 2; i++) {
    const email = `media-product-${randomUUID()}@example.test`,
      password = randomBytes(24).toString('hex');
    const { user } = ok(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
      'Create disposable local account'
    );
    const client = createClient(url, env.ANON_KEY, options);
    ok(await client.auth.signInWithPassword({ email, password }), 'Real local login');
    users.push({ id: user.id, client });
  }
  const [a, b] = users;
  const requestId = randomUUID();
  const workspace = ok(
    await a.client.rpc('media_ensure_workspace', { p_request_id: requestId }),
    'Create owned workspace'
  );
  assert.equal(workspace.owner_id, a.id);
  assert.equal(
    ok(await a.client.rpc('media_ensure_workspace', { p_request_id: requestId }), 'Retry binding').id,
    workspace.id
  );
  assert.equal(
    ok(await a.client.rpc('media_ensure_workspace', { p_request_id: randomUUID() }), 'Reuse canonical workspace').id,
    workspace.id
  );
  assert.ok((await anonymous.rpc('media_ensure_workspace', { p_request_id: randomUUID() })).error);
  assert.deepEqual(
    ok(await b.client.from('media_workspaces').select().eq('id', workspace.id), 'B cannot read A workspace'),
    []
  );
  assert.ok((await b.client.from('media_workspaces').insert({ owner_id: a.id, request_id: randomUUID() })).error);
  assert.ok((await a.client.from('media_workspaces').update({ owner_id: b.id }).eq('id', workspace.id)).error);
  assert.ok((await a.client.from('media_admin_memberships').insert({ user_id: a.id })).error);
  assert.ok((await anonymous.from('media_accounts').select()).error);
  console.log('PASS workspace binding idempotency, anonymous denial, A/B isolation and ownership protection');

  const workB = ok(await b.client.rpc('media_ensure_workspace', { p_request_id: randomUUID() }), 'Create B workspace');
  const record = {
    id: randomUUID(),
    workspaceId: workspace.id,
    kind: 'provider',
    payload: JSON.stringify({
      version: 1,
      name: 'Fixture',
      baseUrl: 'https://provider.example.test/v1',
      model: 'fixture',
      mode: 'direct'
    }),
    revision: 1,
    deleted: false,
    createdBy: a.id,
    updatedBy: a.id
  };
  ok(await a.client.from('media_sync_records').insert(record), 'Write allowed DTO');
  assert.deepEqual(
    ok(await b.client.from('media_sync_records').select().eq('id', record.id), 'Hide A record from B'),
    []
  );
  assert.ok(
    (
      await b.client
        .from('media_sync_records')
        .insert({ ...record, id: randomUUID(), workspaceId: workB.id, createdBy: a.id })
    ).error
  );
  assert.ok(
    (
      await a.client
        .from('media_sync_records')
        .insert({ ...record, id: randomUUID(), payload: JSON.stringify({ version: 1, apiKey: 'fixture-secret' }) })
    ).error
  );
  assert.ok(
    (await a.client.from('media_sync_records').update({ workspaceId: workB.id, revision: 2 }).eq('id', record.id)).error
  );
  ok(
    await a.client
      .from('media_sync_records')
      .update({ payload: record.payload, revision: 3, baseRevision: 1, deleted: true })
      .eq('id', record.id),
    'Persist compacted offline revisions and tombstone'
  );
  assert.ok(
    (
      await a.client
        .from('media_sync_records')
        .update({ payload: record.payload, revision: 4, baseRevision: 1, deleted: false })
        .eq('id', record.id)
    ).error
  );
  assert.ok((await a.client.from('media_sync_records').delete().eq('id', record.id)).error);
  console.log('PASS DTO whitelist, record ownership, revision CAS and persistent tombstones');

  const workerEnv = {
    MEDIA_SUPABASE_URL: url,
    MEDIA_SUPABASE_ANON_KEY: env.ANON_KEY,
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY
  };
  const adminRequest = async (user, path, method = 'GET', payload) => {
    const {
      data: { session }
    } = await user.client.auth.getSession();
    return handleAdmin(
      new Request(`http://127.0.0.1:4399/api/admin/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          origin: 'http://127.0.0.1:4399',
          'content-type': 'application/json'
        },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      }),
      workerEnv
    );
  };
  assert.equal((await adminRequest(a, 'users')).status, 403);
  ok(await b.client.auth.updateUser({ data: { role: 'admin' } }), 'Set untrusted user metadata');
  assert.equal((await adminRequest(b, 'users')).status, 403);
  ok(
    await admin.rpc('media_trusted_membership', {
      p_target: a.id,
      p_enabled: true,
      p_revision: 0,
      p_request_id: randomUUID()
    }),
    'Trusted local administrator bootstrap'
  );
  assert.ok(
    (
      await a.client.rpc('media_trusted_membership', {
        p_target: b.id,
        p_enabled: true,
        p_revision: 0,
        p_request_id: randomUUID()
      })
    ).error
  );
  assert.ok(
    (
      await admin.rpc('media_trusted_membership', {
        p_target: a.id,
        p_enabled: false,
        p_revision: 1,
        p_request_id: randomUUID()
      })
    ).error
  );
  assert.equal((await adminRequest(a, 'users')).status, 200);
  const template = {
    id: templateId,
    title: '本机模板',
    purpose: '创意设计',
    style: '简洁',
    tags: ['本机'],
    prompt: '一张本机海报',
    image: '/prompt-art/local-fixture.svg',
    alt: '示意图',
    updatedAt: '2026-10-24',
    author: 'Aiao',
    source: 'Aiao 原创',
    rights: 'aiao-original-text-and-svg',
    referenceModel: null,
    needsReference: false,
    featuredRank: null
  };
  const saved = await adminRequest(a, `content/template/${templateId}`, 'PUT', {
    revision: 0,
    requestId: randomUUID(),
    payload: template
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await anonymous.from('media_public_content').select().eq('kind', 'template').eq('key', templateId)).data.length,
    0
  );
  assert.equal((await a.client.from('media_content_drafts').select()).error.code, '42501');
  assert.equal(
    (
      await adminRequest(a, `content/template/${templateId}`, 'PUT', {
        revision: 0,
        requestId: randomUUID(),
        payload: template
      })
    ).status,
    409
  );
  assert.equal(
    (await adminRequest(a, `content/template/${templateId}/publish`, 'POST', { revision: 1, requestId: randomUUID() }))
      .status,
    200
  );
  assert.equal(
    (await anonymous.from('media_public_content').select().eq('kind', 'template').eq('key', template.id)).data[0]
      .revision,
    1
  );
  assert.equal(
    (
      await adminRequest(a, `content/template/${templateId}`, 'PUT', {
        revision: 1,
        requestId: randomUUID(),
        payload: { ...template, apiKey: 'must-not-publish' }
      })
    ).status,
    400
  );
  assert.equal(
    (await adminRequest(a, `content/template/${templateId}/withdraw`, 'POST', { revision: 1, requestId: randomUUID() }))
      .status,
    200
  );
  assert.equal(
    (await anonymous.from('media_public_content').select().eq('kind', 'template').eq('key', template.id)).data.length,
    0
  );
  const report = {
    id: randomUUID(),
    taskId: randomUUID(),
    workspaceId: workspace.id,
    model: 'fixture',
    providerId: randomUUID(),
    channel: 'direct',
    status: 'completed',
    startedAt: new Date().toISOString(),
    source: 'application',
    requestCount: 1,
    providerUnits: null,
    verifiedCost: null,
    currency: null
  };
  for (let i = 0; i < 2; i++)
    ok(await a.client.rpc('media_submit_task_reports', { p_reports: [report] }), 'Idempotent task report');
  assert.equal(ok(await a.client.from('media_task_reports').select().eq('id', report.id), 'Own task report').length, 1);
  assert.deepEqual(ok(await b.client.from('media_task_reports').select(), 'B cannot read A report'), []);
  assert.ok((await b.client.rpc('media_submit_task_reports', { p_reports: [report] })).error);
  assert.ok(
    (
      await a.client.rpc('media_submit_task_reports', {
        p_reports: [{ ...report, source: 'verified', verifiedCost: 1, currency: 'USD' }]
      })
    ).error
  );
  assert.equal(
    (await adminRequest(a, `tasks?userId=${a.id}&model=fixture&channel=direct&status=completed`)).status,
    200
  );
  const usage = await (await adminRequest(a, `usage?userId=${a.id}`)).json();
  assert.equal(usage.sources.application.requestCount, 1);
  assert.equal(usage.sources.application.providerUnits, null);
  assert.equal(usage.sources.application.verifiedCost, null);
  console.log(
    'PASS template draft CAS/publish/withdraw, explicit idempotent task reporting, source integrity and usage unknowns'
  );

  assert.ok((await a.client.rpc('media_admin_authorized', { p_actor: a.id })).error);
  const lastAdmin = await adminRequest(a, `users/${a.id}`, 'PATCH', {
    disabled: true,
    revision: 1,
    requestId: randomUUID()
  });
  assert.equal(lastAdmin.status, 409);
  const operation = { disabled: true, revision: 1, requestId: randomUUID() };
  const banned = await adminRequest(a, `users/${b.id}`, 'PATCH', operation);
  assert.equal(banned.status, 200);
  const bannedData = await banned.json();
  assert.equal(bannedData.account.disabled, true);
  assert.equal(bannedData.account.auth_state, 'applied');
  assert.deepEqual(
    ok(await b.client.from('media_workspaces').select(), 'Already-issued B token cannot access product data'),
    []
  );
  assert.equal((await adminRequest(a, `users/${b.id}`, 'PATCH', operation)).status, 200);
  assert.equal(
    ok(await admin.from('media_admin_audit').select('id,action').eq('actor_id', a.id), 'Idempotent audit').filter(
      row => row.action === 'account-state'
    ).length,
    1
  );
  assert.equal(
    (await adminRequest(a, `users/${b.id}`, 'PATCH', { disabled: false, revision: 2, requestId: randomUUID() })).status,
    200
  );
  ok(
    await admin.from('media_admin_memberships').update({ enabled: false }).eq('user_id', a.id),
    'Trusted role revocation'
  );
  assert.equal((await adminRequest(a, 'users')).status, 403);
  console.log(
    'PASS real administrator authorization/revocation, user listing, last-admin protection, idempotent ban/unban and audit'
  );
} finally {
  await admin.from('media_public_content').delete().eq('kind', 'template').eq('key', templateId);
  await admin.from('media_content_drafts').delete().eq('kind', 'template').eq('key', templateId);
  for (const user of users) {
    await user.client.auth.signOut({ scope: 'local' });
    await admin.auth.admin.deleteUser(user.id);
  }
}
