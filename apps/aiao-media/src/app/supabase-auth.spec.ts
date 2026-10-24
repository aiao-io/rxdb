import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthClient, authStorageKey, type SupabaseAuthPort } from './supabase-auth';
import { readSupabaseAuthConfig, validateSupabaseAuthConfig } from './supabase-auth-config';

const config = {
  url: 'https://project.supabase.co',
  anonKey: 'sb_publishable_fixture'
};
const user = { id: 'account-a', email: 'creator@example.com' } as User;
function session(): Session {
  return {
    access_token: 'fixture-access',
    refresh_token: 'fixture-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user
  };
}
function setup() {
  let notify: (event: AuthChangeEvent, session: Session | null) => void = () => undefined;
  const unsubscribe = vi.fn();
  const port = {
    getSession: vi.fn(async () => ({
      data: { session: session() },
      error: null
    })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    signInWithPassword: vi.fn(async () => ({
      data: { session: session(), user },
      error: null
    })),
    signUp: vi.fn(async () => ({
      data: { session: null as Session | null, user },
      error: null
    })),
    signOut: vi.fn(async () => ({ error: null })),
    stopAutoRefresh: vi.fn(async () => undefined),
    onAuthStateChange: vi.fn((callback: typeof notify) => {
      notify = callback;
      return { data: { subscription: { unsubscribe } } };
    })
  };
  const client = new SupabaseAuthClient(config, async () => port as unknown as SupabaseAuthPort);
  return {
    port,
    client,
    unsubscribe,
    emit: (event: AuthChangeEvent) => notify(event, event === 'SIGNED_OUT' ? null : session())
  };
}
const clients: SupabaseAuthClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});
function fixture() {
  const result = setup();
  clients.push(result.client);
  return result;
}

describe('optional account configuration', () => {
  it('disables accounts without configuration and rejects unsafe URLs and privileged keys', () => {
    expect(readSupabaseAuthConfig({})).toBeNull();
    expect(readSupabaseAuthConfig({ __AIAO_SUPABASE_CONFIG__: config })).toEqual(config);
    const service = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    for (const value of [
      { ...config, url: 'http://project.supabase.co' },
      { ...config, url: 'http://localhost.example.com' },
      { ...config, url: 'http://192.168.1.2:54321' },
      { ...config, url: 'https://user:password@project.supabase.co' },
      { ...config, url: 'https://project.supabase.co/path' },
      { ...config, anonKey: service },
      { ...config, anonKey: 'sb_secret_fixture' }
    ])
      expect(() => validateSupabaseAuthConfig(value)).toThrow();
    expect(authStorageKey(config)).not.toBe(authStorageKey({ ...config, url: 'https://other.supabase.co' }));
  });
});

describe('account session boundary', () => {
  it('allows HTTP only for local loopback Supabase origins', () => {
    for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
      expect(validateSupabaseAuthConfig({ ...config, url }).url).toBe(url);
    }
  });

  it('verifies a persisted session with the server before showing an account', async () => {
    const { client, port } = fixture();
    await client.restore();
    expect(port.getUser).toHaveBeenCalledWith('fixture-access');
    expect(client.state).toEqual({
      status: 'signed-in',
      user: { id: user.id, email: user.email },
      message: ''
    });
    expect(JSON.stringify(client.state)).not.toContain('fixture-access');
    expect(JSON.stringify(client.state)).not.toContain('fixture-refresh');
  });

  it('keeps temporary verification failures unverified and supports retry', async () => {
    const { client, port } = fixture();
    port.getUser.mockRejectedValueOnce(new TypeError('offline'));
    await client.restore();
    expect(client.state.status).toBe('unverified');
    expect(client.state.user).toBeNull();
    expect(port.signOut).not.toHaveBeenCalled();
    await client.restore();
    expect(client.state.status).toBe('signed-in');
  });

  it('does not accept an expired session or a different server identity', async () => {
    const { client, port } = fixture();
    port.getSession.mockResolvedValueOnce({
      data: { session: { ...session(), expires_at: 1 } },
      error: null
    });
    await client.restore();
    expect(client.state.status).toBe('unverified');
    expect(port.getUser).not.toHaveBeenCalled();
    port.getUser.mockResolvedValueOnce({
      data: { user: { ...user, id: 'account-b' } },
      error: null
    });
    await client.restore();
    expect(client.state.user).toBeNull();
  });

  it('rejects a late verification after local logout, even when remote logout fails', async () => {
    const { client, port } = fixture();
    let reply!: (value: { data: { user: User }; error: null }) => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          reply = resolve;
        })
    );
    const restoring = client.restore();
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalled());
    port.signOut.mockRejectedValueOnce(new Error('upstream fixture-access'));
    const leaving = client.signOut();
    expect(client.state.status).toBe('signed-out');
    await expect(leaving).rejects.toThrow();
    reply({ data: { user }, error: null });
    await restoring;
    expect(client.state.user).toBeNull();
    expect(port.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reacts to a logout from another tab and ignores in-flight verification', async () => {
    const { client, port, emit } = fixture();
    let reply!: (value: { data: { user: User }; error: null }) => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          reply = resolve;
        })
    );
    const pending = client.restore();
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalled());
    emit('SIGNED_OUT');
    reply({ data: { user }, error: null });
    await pending;
    expect(client.state.status).toBe('signed-out');
  });

  it('shows email confirmation without inventing a signed-in session', async () => {
    const { client } = fixture();
    await client.signUp('creator@example.com', 'a-strong-password');
    expect(client.state.status).toBe('signed-out');
    expect(client.state.message).toContain('完成确认');
    await client.signIn('creator@example.com', 'a-strong-password');
    expect(client.state.user?.id).toBe('account-a');
  });

  it('sanitizes upstream errors and releases subscriptions on disposal', async () => {
    const { client, port, emit, unsubscribe } = fixture();
    port.signInWithPassword.mockRejectedValueOnce(new Error('fixture-access fixture-refresh'));
    await expect(client.signIn('creator@example.com', 'a-password')).rejects.toThrow('账号服务暂不可用');
    client.dispose();
    emit('SIGNED_IN');
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(client.state.status).toBe('signed-out');
  });
});
