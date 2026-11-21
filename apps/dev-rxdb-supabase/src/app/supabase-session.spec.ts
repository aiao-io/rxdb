import { describe, expect, it, vi } from 'vitest';
import { ensureSupabaseSession, type SupabaseSessionAuth } from './supabase-session';

const EXISTING_USER = '00000000-0000-4000-8000-0000000000a1';
const NEW_USER = '00000000-0000-4000-8000-0000000000b2';

function createAuth(
  session: { user?: { id: string } } | null,
  options: { signInError?: Error | null; signedInUser?: { id: string } | null } = {}
) {
  const getSession = vi.fn(async () => ({ data: { session }, error: null }));
  const signInAnonymously = vi.fn(async () => ({
    data: { user: options.signedInUser === undefined ? { id: NEW_USER } : options.signedInUser, session: null },
    error: options.signInError ?? null
  }));
  return { auth: { getSession, signInAnonymously } as unknown as SupabaseSessionAuth, getSession, signInAnonymously };
}

describe('ensureSupabaseSession', () => {
  it('keeps an existing session without signing in again', async () => {
    const { auth, signInAnonymously } = createAuth({ user: { id: EXISTING_USER } });

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
    const { auth } = createAuth(null, { signInError: refused });

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

  // 本地库按这个用户 id 命名（US-035）：回答错了，库就开错了。
  describe('returns who the session belongs to', () => {
    it('the user of the existing session', async () => {
      const { auth } = createAuth({ user: { id: EXISTING_USER } });

      await expect(ensureSupabaseSession(auth)).resolves.toBe(EXISTING_USER);
    });

    it('the new anonymous user after signing in', async () => {
      const { auth } = createAuth(null);

      await expect(ensureSupabaseSession(auth)).resolves.toBe(NEW_USER);
    });

    it('refuses to guess when the sign-in returns no user', async () => {
      const { auth } = createAuth(null, { signedInUser: null });

      await expect(ensureSupabaseSession(auth)).rejects.toThrow(/user/i);
    });
  });
});
