import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { handleAdmin } from '../../apps/api/src/admin-api.ts';
import { handleCredits } from '../../apps/api/src/credits-api.ts';
import { localEnvironment } from '../supabase/supabase-local.mjs';

const { env, url } = await localEnvironment();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, env.SERVICE_ROLE_KEY, options);
const environment = {
  MEDIA_SUPABASE_URL: url,
  MEDIA_SUPABASE_ANON_KEY: env.ANON_KEY,
  MEDIA_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY
};
const users = [];
const ok = (result, label) => {
  assert.equal(result.error, null, label);
  return result.data;
};
try {
  for (let i = 0; i < 3; i++) {
    const email = `media-credits-${randomUUID()}@example.test`,
      password = randomBytes(24).toString('hex');
    const { user } = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Create fixture');
    const client = createClient(url, env.ANON_KEY, options);
    const { session } = ok(await client.auth.signInWithPassword({ email, password }), 'Login fixture');
    users.push({ ...user, client, token: session.access_token });
  }
  const [actor, owner, other] = users;
  ok(await admin.from('media_admin_memberships').insert({ user_id: actor.id }), 'Grant administrator');
  const request = (user, path, method = 'GET', payload) =>
    new Request(`http://127.0.0.1:4300/api/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${user.token}`,
        origin: 'http://127.0.0.1:4300',
        'content-type': 'application/json'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  const path = `admin/users/${owner.id}/credits`;
  const adjustment = { delta: 10, reason: '真实本地积分验收', requestId: randomUUID() };
  assert.equal((await handleAdmin(request(other, path, 'POST', adjustment), environment)).status, 403);
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => handleAdmin(request(actor, path, 'POST', adjustment), environment))
  );
  assert.ok(attempts.every(result => result.status === 200));
  const snapshot = await (await handleCredits(request(owner, 'credits'), environment)).json();
  assert.equal(snapshot.account.balance, 10);
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].reason, adjustment.reason);
  assert.deepEqual(ok(await other.client.from('media_credit_ledger').select(), 'Isolate other user'), []);
  assert.ok(
    (
      await owner.client.rpc('media_admin_adjust_credits', {
        p_actor: actor.id,
        p_target: owner.id,
        p_delta: 100,
        p_reason: '伪造',
        p_request_id: randomUUID()
      })
    ).error
  );
  assert.ok((await admin.from('media_credit_ledger').update({ delta: 100 }).eq('user_id', owner.id)).error);
  assert.ok((await admin.from('media_credit_ledger').delete().eq('user_id', owner.id)).error);
  const search = await handleAdmin(
    request(actor, `admin/users?search=${encodeURIComponent(owner.email)}`),
    environment
  );
  assert.equal((await search.json()).users[0].id, owner.id);
  console.log(
    'PASS real Auth, administrator grants, eight concurrent idempotent adjustments, own balance, ledger immutability and email search'
  );

  const taskIds = Array.from({ length: 8 }, () => randomUUID());
  const reservations = await Promise.all(
    taskIds.map(task =>
      admin.rpc('media_reserve_credits', {
        p_owner: owner.id,
        p_task: task,
        p_cost: 7,
        p_fingerprint: 'a'.repeat(64),
        p_token_hash: 'b'.repeat(64)
      })
    )
  );
  assert.equal(reservations.filter(result => !result.error).length, 1);
  assert.ok(reservations.filter(result => result.error).every(result => result.error.code === 'PT402'));
  const task = taskIds[reservations.findIndex(result => !result.error)];
  const settlements = await Promise.all(
    Array.from({ length: 8 }, () => admin.rpc('media_settle_credits', { p_task: task, p_received: true }))
  );
  settlements.forEach(result => ok(result, 'Idempotent concurrent settlement'));
  const charged = await (await handleCredits(request(owner, 'credits'), environment)).json();
  assert.deepEqual(charged.account, { balance: 3, reserved: 0, available: 3 });
  assert.equal(charged.entries.filter(entry => entry.source === 'generation').length, 1);
  const released = randomUUID();
  ok(
    await admin.rpc('media_reserve_credits', {
      p_owner: owner.id,
      p_task: released,
      p_cost: 3,
      p_fingerprint: 'c'.repeat(64),
      p_token_hash: 'd'.repeat(64)
    }),
    'Reserve failed task'
  );
  ok(await admin.rpc('media_settle_credits', { p_task: released, p_received: false }), 'Release failed task');
  assert.equal((await (await handleCredits(request(owner, 'credits'), environment)).json()).account.available, 3);
  console.log(
    'PASS real PostgreSQL concurrent reservations prevent double spending, eight settlements charge once, failed task releases its reservation'
  );

  ok(
    await admin.from('media_admin_memberships').update({ enabled: false }).eq('user_id', actor.id),
    'Revoke administrator'
  );
  assert.equal((await handleAdmin(request(actor, path), environment)).status, 403);
} finally {
  for (const user of users) {
    await user.client.auth.signOut({ scope: 'local' });
    ok(await admin.auth.admin.deleteUser(user.id), 'Delete disposable fixture');
  }
}
