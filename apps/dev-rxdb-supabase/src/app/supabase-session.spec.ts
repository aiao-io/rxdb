import { describe, expect, it, vi } from 'vitest';
import { ensureSupabaseSession, type SupabaseSessionAuth } from './supabase-session';

function createAuth(session: object | null, signInError: Error | null = null) {
  const getSession = vi.fn(async () => ({ data: { session }, error: null }));
  const signInAnonymously = vi.fn(async () => ({ data: { user: null, session: null }, error: signInError }));
  return { auth: { getSession, signInAnonymously } as unknown as SupabaseSessionAuth, getSession, signInAnonymously };
}

describe('ensureSupabaseSession', () => {
  it('keeps an existing session without signing in again', async () => {
    const { auth, signInAnonymously } = createAuth({ access_token: 'existing' });

    await ensureSupabaseSession(auth);

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when there is no session', async () => {
    const { auth, signInAnonymously } = createAuth(null);

    await ensureSupabaseSession(auth);

    expect(signInAnonymously).toHaveBeenCalledOnce();
  });

  it('surfaces a refused anonymous sign-in instead of syncing as anon', async () => {
    const refused = new Error('Anonymous sign-ins are disabled');
    const { auth } = createAuth(null, refused);

    await expect(ensureSupabaseSession(auth)).rejects.toBe(refused);
  });

  it('surfaces a failure to read the stored session', async () => {
    const broken = new Error('storage unavailable');
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: null }, error: broken })),
      signInAnonymously: vi.fn()
    } as unknown as SupabaseSessionAuth;

    await expect(ensureSupabaseSession(auth)).rejects.toBe(broken);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
});
