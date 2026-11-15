import assert from 'node:assert/strict';
import test from 'node:test';
import type { RxDB } from '@aiao/rxdb';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BackendRxdbAuthProvider,
  assertBackendRxdbAuth,
  assertBackendWorkspaceId,
  createBackendRxdbSyncConfig,
  createBackendSupabaseHeaders
} from './backend-rxdb.ts';
import { BackendRxdbLifecycle } from './backend-rxdb-lifecycle.ts';
import type { BackendRxdbSession } from './backend-rxdb.ts';

const token = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
const auth = (expiresAt = Date.now() + 60000) => ({ accessToken: token('authenticated'), userId: 'owner', expiresAt });

function fakeSession(sync: () => Promise<{ branches: string; sync: string }>): { session: BackendRxdbSession; calls: { close: number } } {
  const calls = { close: 0 };
  const session = {
    db: {
      syncManager: {
        syncBranches: async () => (await sync()).branches,
        sync: async () => (await sync()).sync
      }
    } as unknown as RxDB,
    supabase: {} as SupabaseClient,
    close: async () => {
      calls.close++;
    }
  };
  return { session, calls };
}

test('backend RxDB rejects service role tokens as sync identities', () => {
  assert.throws(
    () => assertBackendRxdbAuth({ accessToken: token('service_role'), userId: 'owner', expiresAt: Date.now() + 60000 }),
    /service role/
  );
  assert.doesNotThrow(() => assertBackendRxdbAuth(auth()));
});

test('backend RxDB headers carry only the ordinary JWT and publishable key', () => {
  assert.deepEqual(
    createBackendSupabaseHeaders('publishable-key', 'ordinary-token'),
    { apikey: 'publishable-key', authorization: 'Bearer ordinary-token' }
  );
});

test('backend workspace sync uses a fixed entity filter and never changes the ordinary JWT boundary', () => {
  const entity = class MediaRecord {};
  const workspaceId = '10000000-0000-4000-8000-000000000001';
  const config = createBackendRxdbSyncConfig({ entities: [entity], workspaceId });
  assert.equal(config.sync.type, 'full');
  assert.equal(config.syncOverrides?.length, 1);
  const filtered = config.syncOverrides?.[0]?.sync;
  assert.equal(filtered?.type, 'filter');
  if (filtered?.type !== 'filter') throw new Error('expected filter sync');
  assert.deepEqual(filtered.remote.filter(), {
    combinator: 'and',
    rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }]
  });
  assert.equal(createBackendSupabaseHeaders('publishable-key', 'ordinary-token').authorization, 'Bearer ordinary-token');
});

test('backend workspace IDs reject values that cannot be used as an RLS filter', () => {
  assert.equal(assertBackendWorkspaceId(' 10000000-0000-4000-8000-000000000001 '), '10000000-0000-4000-8000-000000000001');
  assert.throws(() => assertBackendWorkspaceId('other-workspace'), /workspaceId must be a UUID/);
});

test('backend RxDB rejects expired or incomplete identities before opening a database', () => {
  assert.throws(() => assertBackendRxdbAuth({ accessToken: '', userId: 'owner', expiresAt: Date.now() + 60000 }), /access token/);
  assert.throws(() => assertBackendRxdbAuth({ accessToken: token('authenticated'), userId: '', expiresAt: Date.now() + 60000 }), /user ID/);
  assert.throws(() => assertBackendRxdbAuth({ accessToken: token('authenticated'), userId: 'owner', expiresAt: Date.now() - 1 }), /expired/);
});

test('backend auth provider refreshes an expired ordinary JWT and still rejects service role', async () => {
  const provider = new BackendRxdbAuthProvider(
    auth(Date.now() - 1),
    async () => ({ ...auth(), accessToken: token('authenticated-refreshed') })
  );
  assert.equal((await provider.valid()).accessToken, token('authenticated-refreshed'));
  assert.throws(() => provider.set({ accessToken: token('service_role'), userId: 'owner', expiresAt: Date.now() + 60000 }), /service role/);
});

test('backend RxDB lifecycle deduplicates sync, supports pause/resume and closes once', async () => {
  let syncCalls = 0;
  const { session, calls } = fakeSession(async () => {
    syncCalls++;
    return { branches: `branches-${syncCalls}`, sync: `sync-${syncCalls}` };
  });
  const states: string[] = [];
  const lifecycle = new BackendRxdbLifecycle(session, {
    syncIntervalMs: 1000,
    onStateChange: state => states.push(state)
  });
  try {
    const first = lifecycle.start();
    const second = lifecycle.start();
    assert.deepEqual(await first, { branches: 'branches-1', sync: 'sync-2' });
    assert.deepEqual(await second, { branches: 'branches-1', sync: 'sync-2' });
    assert.equal(syncCalls, 2);
    lifecycle.pause();
    assert.equal(lifecycle.state, 'paused');
    await assert.rejects(() => lifecycle.syncNow(), /paused/);
    await lifecycle.resume();
    assert.equal(lifecycle.state, 'online');
  } finally {
    await lifecycle.close();
  }
  assert.equal(calls.close, 1);
  assert.equal(lifecycle.state, 'closed');
  assert.deepEqual(states, ['starting', 'online', 'paused', 'starting', 'online', 'closed']);
});
