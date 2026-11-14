import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { localEnvironment } from './supabase-local.mjs';

export async function confirmLocalEmail(mailUrl, email) {
  const mailbox = encodeURIComponent(email.split('@')[0]);
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(`${mailUrl}/api/v1/mailbox/${mailbox}`);
    if (response.ok) {
      const messages = await response.json();
      if (messages.length) {
        const message = await fetch(`${mailUrl}/api/v1/mailbox/${mailbox}/${messages.at(-1).id}`).then(r => r.json());
        const body = message.body.html || message.body.text;
        const match = body.match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/);
        assert.ok(match, 'Local confirmation email must contain an Auth verification link');
        const verifyUrl = new URL(match[0].replaceAll('&amp;', '&'));
        const { url } = await localEnvironment();
        assert.equal(verifyUrl.origin, url, 'Confirmation must stay on the local stack');
        const confirmed = await fetch(verifyUrl, { redirect: 'manual' });
        assert.ok([302, 303].includes(confirmed.status), 'Email confirmation should redirect');
        assert.ok(!new URL(confirmed.headers.get('location')).hash.includes('error'), 'Email verification failed');
        return;
      }
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for local confirmation email');
}

function ok(result, message) {
  assert.equal(result.error?.message ?? null, null, message);
  return result.data;
}

export async function testLocalSupabase() {
  const { env, url, mailUrl } = await localEnvironment();
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  };
  const admin = createClient(url, env.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(url, env.ANON_KEY, options);
  const clients = [createClient(url, env.ANON_KEY, options), createClient(url, env.ANON_KEY, options)];
  const users = [];
  try {
    const preflight = await fetch(`${url}/auth/v1/token`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:4300',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'apikey,authorization,content-type,x-client-info,x-supabase-api-version'
      }
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:4300', 'Browser CORS origin');
    for (const client of clients) {
      const email = `aiao-check-${randomUUID()}@example.test`;
      const password = randomBytes(24).toString('hex');
      const signup = ok(await client.auth.signUp({ email, password }), 'Real email signup');
      users.push({ id: signup.user.id, email });
      assert.equal(signup.session, null, 'Signup waits for email confirmation');
      const beforeConfirmation = await client.auth.signInWithPassword({
        email,
        password
      });
      assert.equal(beforeConfirmation.error?.code, 'email_not_confirmed');
      await confirmLocalEmail(mailUrl, email);
      const login = ok(await client.auth.signInWithPassword({ email, password }), 'Confirmed account can sign in');
      assert.equal(login.user.id, signup.user.id);
      assert.equal(ok(await client.auth.getUser(), 'Server verifies session').user.id, signup.user.id);
    }
    console.log('PASS real signup, local email confirmation, login and server session verification');

    const [a, b] = clients;
    const [userA, userB] = users;
    const row = ok(
      await a.from('local_account_checks').insert({ note: 'A private probe' }).select().single(),
      'A creates an owned row'
    );
    assert.equal(row.owner_id, userA.id);
    assert.deepEqual(ok(await b.from('local_account_checks').select().eq('id', row.id), 'B read is filtered'), []);
    assert.deepEqual(
      ok(
        await b.from('local_account_checks').update({ note: 'B attack' }).eq('id', row.id).select(),
        'B update is filtered'
      ),
      []
    );
    assert.deepEqual(
      ok(await b.from('local_account_checks').delete().eq('id', row.id).select(), 'B delete is filtered'),
      []
    );
    assert.ok(
      (await b.from('local_account_checks').insert({ owner_id: userA.id, note: 'spoof owner' })).error,
      'RLS rejects forged owner'
    );
    assert.ok(
      (await a.from('local_account_checks').update({ owner_id: userB.id }).eq('id', row.id)).error,
      'RLS rejects ownership transfer'
    );
    assert.ok((await anonymous.from('local_account_checks').select()).error, 'Anonymous access is denied');
    assert.equal(
      ok(await a.from('local_account_checks').select().eq('id', row.id).single(), 'A row survives denied writes').note,
      'A private probe'
    );
    console.log(
      'PASS database RLS: read/update/delete isolation, forged owner, ownership transfer and anonymous denial'
    );

    const received = [[], []];
    const channels = clients.map((client, index) =>
      client
        .channel(`local-check-${randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'local_account_checks' }, change =>
          received[index].push(change.new)
        )
    );
    await Promise.all(
      channels.map(
        channel =>
          new Promise((resolveSubscription, reject) => {
            // A channel join can finish before its PostgreSQL subscription is ready.
            // Waiting for both prevents the first writes from racing Realtime startup.
            let joined = false;
            let postgresReady = false;
            const timer = setTimeout(() => reject(new Error('PostgreSQL Realtime subscription timed out')), 20000);
            const ready = () => {
              if (joined && postgresReady) {
                clearTimeout(timer);
                resolveSubscription();
              }
            };
            channel.on('system', {}, payload => {
              if (payload.extension !== 'postgres_changes') return;
              if (payload.status === 'ok') {
                postgresReady = true;
                ready();
              } else if (payload.status === 'error') {
                clearTimeout(timer);
                reject(new Error('PostgreSQL Realtime subscription failed; inspect the local Realtime service.'));
              }
            });
            channel.subscribe(status => {
              if (status === 'SUBSCRIBED') {
                joined = true;
                ready();
              } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
                clearTimeout(timer);
                reject(new Error(`Realtime subscription: ${status}`));
              }
            });
          })
      )
    );
    const realtimeA = ok(
      await a.from('local_account_checks').insert({ note: 'A realtime probe' }).select().single(),
      'A realtime write'
    );
    const realtimeB = ok(
      await b.from('local_account_checks').insert({ note: 'B realtime probe' }).select().single(),
      'B realtime write'
    );
    for (
      let attempt = 0;
      attempt < 80 &&
      (!received[0].some(value => value.id === realtimeA.id) || !received[1].some(value => value.id === realtimeB.id));
      attempt++
    )
      await delay(100);
    // A newly started WAL poller may also deliver this run's earlier owned row.
    // Assert ownership for every event, and exact delivery for the two new rows.
    const probeIds = new Set([realtimeA.id, realtimeB.id]);
    assert.ok(
      received[0].every(value => value.owner_id === userA.id),
      'Every A event is owned by A'
    );
    assert.ok(
      received[1].every(value => value.owner_id === userB.id),
      'Every B event is owned by B'
    );
    assert.deepEqual(
      received[0].filter(value => probeIds.has(value.id)).map(value => value.id),
      [realtimeA.id],
      'A receives only A probe'
    );
    assert.deepEqual(
      received[1].filter(value => probeIds.has(value.id)).map(value => value.id),
      [realtimeB.id],
      'B receives only B probe'
    );
    await Promise.all(clients.map(client => client.removeAllChannels()));
    console.log('PASS real WebSocket subscriptions and Realtime RLS isolation');

    const refreshed = ok(await a.auth.refreshSession(), 'Real refresh-token exchange');
    const refreshToken = refreshed.session.refresh_token;
    ok(await a.auth.signOut({ scope: 'local' }), 'Remote session logout');
    assert.equal(ok(await a.auth.getSession(), 'Local session cleared').session, null);
    assert.ok(
      (await a.auth.refreshSession({ refresh_token: refreshToken })).error,
      'Logout revokes refresh credentials'
    );
    console.log('PASS session refresh, logout and refresh-token revocation');
  } finally {
    await Promise.all(clients.map(client => client.removeAllChannels()));
    for (const user of users) {
      ok(await admin.auth.admin.deleteUser(user.id), 'Remove only this run’s temporary account');
      await fetch(`${mailUrl}/api/v1/mailbox/${encodeURIComponent(user.email.split('@')[0])}`, { method: 'DELETE' });
    }
    await admin.removeAllChannels();
    await anonymous.removeAllChannels();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  testLocalSupabase().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
