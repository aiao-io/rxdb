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
    const restoring = client.restore();
    expect(client.state).toMatchObject({ status: 'checking', user: null });
    await restoring;
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

describe('verified product session authorization', () => {
  it('requires a verified login and verifies the current server identity again for each product operation', async () => {
    const { client, port } = fixture();
    await expect(client.authorizeProduct()).rejects.toThrow('先验证');
    await client.restore();
    expect(await client.authorizeProduct()).toMatchObject({ userId: user.id, config });
    expect(port.getUser).toHaveBeenCalledTimes(2);
    port.getUser.mockResolvedValueOnce({ data: { user: { ...user, id: 'other' } }, error: null });
    await expect(client.authorizeProduct()).rejects.toThrow('服务端验证');
  });

  it.each([{ access_token: '' }, { expires_at: 1 }, { expires_at: undefined }, { user: { ...user, id: 'other' } }])(
    'rejects changed or expired local session material before product access',
    async patch => {
      const { client, port } = fixture();
      await client.restore();
      port.getSession.mockResolvedValueOnce({ data: { session: { ...session(), ...patch } }, error: null });
      await expect(client.authorizeProduct()).rejects.toThrow('账号会话已变化');
    }
  );

  it('drops authorization if logout happens during server verification', async () => {
    const { client, port } = fixture();
    await client.restore();
    let release!: () => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { user }, error: null });
        })
    );
    const authorization = client.authorizeProduct();
    const assertion = expect(authorization).rejects.toThrow('服务端验证');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledTimes(2));
    await client.signOut();
    release();
    await assertion;
  });

  it('deduplicates concurrent restoration and restores an absent persisted session as signed out', async () => {
    const { client, port } = fixture();
    await Promise.all([client.restore(), client.restore()]);
    expect(port.getSession).toHaveBeenCalledTimes(1);
    port.getSession.mockResolvedValueOnce({ data: { session: null as unknown as Session }, error: null });
    await client.restore();
    expect(client.state.status).toBe('signed-out');
    expect(client.state.user).toBeNull();
  });

  it('re-verifies refreshed tokens and notifies subscribers without exposing session tokens', async () => {
    const { client, port, emit } = fixture();
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    await client.restore();
    emit('TOKEN_REFRESHED');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledTimes(2));
    expect(JSON.stringify(listener.mock.calls)).not.toContain('fixture-access');
    unsubscribe();
    const before = listener.mock.calls.length;
    emit('SIGNED_OUT');
    expect(listener).toHaveBeenCalledTimes(before);
  });

  it('相同有效会话的后台复验不清空已验证身份或重复通知工作区', async () => {
    const { client, port, emit } = fixture();
    await client.restore();
    const listener = vi.fn();
    client.subscribe(listener);
    listener.mockClear();
    let release!: () => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { user }, error: null });
        })
    );
    emit('SIGNED_IN');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledTimes(2));
    try {
      expect(client.state.status).toBe('signed-in');
      expect(client.state.user?.id).toBe(user.id);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      release();
      await client.restore();
    }
    expect(listener).not.toHaveBeenCalled();
  });

  it('刷新得到不同token时仍通知工作区重新建立授权副本', async () => {
    const { client, port, emit } = fixture();
    await client.restore();
    const listener = vi.fn();
    client.subscribe(listener);
    listener.mockClear();
    port.getSession.mockResolvedValueOnce({
      data: { session: { ...session(), access_token: 'fixture-refreshed-access' } },
      error: null
    });
    emit('TOKEN_REFRESHED');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledWith('fixture-refreshed-access'));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed-in' })));
    expect(JSON.stringify(listener.mock.calls)).not.toContain('fixture-refreshed-access');
  });

  it.each(['token', 'account', 'verification'] as const)('在%s变化后拒绝迟到的旧会话授权', async change => {
    const { client, port, emit } = fixture();
    await client.restore();
    let release!: () => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { user }, error: null });
        })
    );
    const pending = client.authorizeProduct();
    const rejected = expect(pending).rejects.toThrow('服务端验证');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledTimes(2));
    if (change === 'verification') {
      port.getUser.mockRejectedValueOnce(new Error('revoked'));
      emit('SIGNED_IN');
      await vi.waitFor(() => expect(client.state.status).toBe('unverified'));
      expect(client.state.user).toBeNull();
    } else {
      const nextUser = change === 'account' ? { ...user, id: 'account-b' } : user;
      port.getSession.mockResolvedValueOnce({
        data: { session: { ...session(), user: nextUser, access_token: 'fixture-next-access' } },
        error: null
      });
      port.getUser.mockResolvedValueOnce({ data: { user: nextUser }, error: null });
      const listener = vi.fn();
      client.subscribe(listener);
      listener.mockClear();
      emit(change === 'token' ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
      await vi.waitFor(() =>
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'signed-in',
            user: { id: nextUser.id, email: nextUser.email }
          })
        )
      );
    }
    release();
    await rejected;
  });

  it('服务端验证返回时已过期的会话不能得到产品授权', async () => {
    vi.useFakeTimers();
    const { client, port } = fixture();
    await client.restore();
    let release!: () => void;
    port.getUser.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { user }, error: null });
        })
    );
    const pending = client.authorizeProduct();
    const rejected = expect(pending).rejects.toThrow('服务端验证');
    await vi.waitFor(() => expect(port.getUser).toHaveBeenCalledTimes(2));
    vi.setSystemTime(Date.now() + 3600001);
    release();
    await rejected;
  });

  it('expires a verified session and retries verification without treating an expired cache as authenticated', async () => {
    vi.useFakeTimers();
    const { client, port } = fixture();
    port.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    await client.restore();
    expect(client.state.status).toBe('signed-in');
    await vi.advanceTimersByTimeAsync(3600000);
    expect(client.state.status).toBe('unverified');
  });

  it.each([
    [{ code: 'invalid_credentials' }, '邮箱或密码不正确'],
    [{ code: 'email_not_confirmed' }, '完成邮箱确认'],
    [{ code: 'weak_password' }, '密码不符合'],
    [{ status: 429 }, '过于频繁'],
    [{ code: 'over_email_send_rate_limit' }, '过于频繁']
  ] as const)('maps known account errors to fixed messages', async (error, text) => {
    const { client, port } = fixture();
    port.signInWithPassword.mockRejectedValue({ ...error, message: 'private-upstream' });
    await expect(client.signIn('fixture@example.test', 'fixture-password')).rejects.toThrow(text);
    expect(client.state.status).toBe('signed-out');
    expect(client.state.message).not.toContain('private-upstream');
  });

  it.each([
    ['invalid-email', 'secret'],
    ['fixture@example.test', '']
  ])('rejects malformed login input before initializing the SDK', async (email, password) => {
    const { client, port } = fixture();
    await expect(client.signIn(email, password)).rejects.toThrow('有效邮箱和密码');
    expect(port.signInWithPassword).not.toHaveBeenCalled();
  });

  it('requires a registration password of at least six characters', async () => {
    const { client, port } = fixture();
    await expect(client.signUp('fixture@example.test', 'short')).rejects.toThrow('至少 6 位');
    expect(port.signUp).not.toHaveBeenCalled();
  });

  it('does not restart authentication or restoration after disposing the account client', async () => {
    const { client, port } = fixture();
    client.dispose();
    await client.restore();
    await client.signIn('fixture@example.test', 'fixture-password');
    expect(port.signInWithPassword).not.toHaveBeenCalled();
    expect(port.getSession).not.toHaveBeenCalled();
  });
});
