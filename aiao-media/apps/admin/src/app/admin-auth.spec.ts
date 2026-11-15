import type { Session, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminSupabaseAuth, type AdminSupabaseClient } from './admin-auth';

const config = { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' };
const user: User = {
  id: '10000000-0000-4000-8000-000000000001',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z'
};
const session: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user
};
function fakeClient(overrides: Partial<AdminSupabaseClient['auth']> = {}): AdminSupabaseClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session, user }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      ...overrides
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) }
  };
}
afterEach(() => vi.restoreAllMocks());

describe('AdminSupabaseAuth', () => {
  it('logs in directly through Supabase Auth and exposes the verified session', async () => {
    const client = fakeClient();
    const auth = new AdminSupabaseAuth(config, async () => client);
    const result = await auth.signIn('owner@example.test', 'password');
    expect(result).toMatchObject({ accessToken: 'access-token', user: { id: user.id } });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: 'password' });
    expect(await auth.authorization()).toMatchObject({ userId: user.id, session: { access_token: 'access-token' } });
  });

  it('restores an SDK session and falls back to a valid legacy session for migration', async () => {
    const client = fakeClient({ getSession: vi.fn(async () => ({ data: { session }, error: null })) });
    const auth = new AdminSupabaseAuth(config, async () => client);
    expect(await auth.restore(null)).toMatchObject({ accessToken: 'access-token' });

    const legacyClient = fakeClient();
    const legacy = { accessToken: 'legacy-token', expiresAt: Date.now() + 60000, user: { id: user.id, email: null } };
    const legacyAuth = new AdminSupabaseAuth(config, async () => legacyClient);
    expect(await legacyAuth.restore(legacy)).toEqual(legacy);
    expect(legacyClient.auth.getUser).toHaveBeenCalledWith('legacy-token');
  });

  it('signs out locally through Supabase and invalidates authorization', async () => {
    const client = fakeClient();
    const auth = new AdminSupabaseAuth(config, async () => client);
    await auth.signIn('owner@example.test', 'password');
    await auth.signOut();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await expect(auth.authorization()).rejects.toThrow('请先验证当前账号');
  });
});
