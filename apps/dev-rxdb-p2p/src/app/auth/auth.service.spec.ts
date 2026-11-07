import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn()
}));
vi.mock('../config/runtime-config', () => ({
  readRuntimeConfig: () => ({ supabaseUrl: 'http://auth.test', supabaseAnonKey: 'public-key' })
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: auth.getSession,
      signInWithPassword: auth.signInWithPassword,
      signUp: auth.signUp,
      signOut: auth.signOut,
      onAuthStateChange: (listener: typeof auth.listener) => {
        auth.listener = listener;
      }
    }
  })
}));

const session = (token: string): Session => ({
  access_token: token,
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-05T00:00:00Z' }
});

describe('AuthService session lifecycle', () => {
  let service: AuthService;
  beforeEach(async () => {
    vi.resetAllMocks();
    auth.session = session('initial');
    auth.getSession.mockImplementation(async () => ({ data: { session: auth.session }, error: null }));
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signUp.mockResolvedValue({ data: { session: auth.session }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    service = new AuthService();
    await service.restored;
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores the saved account and reacts to refreshed credentials and logout', async () => {
    expect(service.session()?.access_token).toBe('initial');
    auth.session = session('renewed');
    auth.listener?.('TOKEN_REFRESHED', auth.session);
    expect(service.session()?.access_token).toBe('renewed');
    expect(await service.accessToken()).toBe('renewed');
    auth.listener?.('SIGNED_OUT', null);
    expect(service.session()).toBeNull();
  });

  it('returns authentication errors so the login page can explain failures', async () => {
    await service.signIn('person@example.com', 'password');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'person@example.com', password: 'password' });
    auth.signInWithPassword.mockResolvedValueOnce({ error: new Error('密码错误') });
    await expect(service.signIn('person@example.com', 'wrong')).rejects.toThrow('密码错误');
  });

  it('distinguishes successful registration from email confirmation and server rejection', async () => {
    await expect(service.signUp('person@example.com', 'password')).resolves.toBeUndefined();
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(service.signUp('person@example.com', 'password')).rejects.toThrow('验证链接');
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: new Error('账号已存在') });
    await expect(service.signUp('person@example.com', 'password')).rejects.toThrow('账号已存在');
  });

  it('refuses a token when the session expired or refresh failed', async () => {
    auth.session = null;
    await expect(service.accessToken()).rejects.toThrow('not signed in');
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('续期失败') });
    await expect(service.accessToken()).rejects.toThrow('续期失败');
  });

  it('finishes signing out before reloading the login page', async () => {
    const navigate = vi.spyOn(location, 'assign').mockImplementation(() => undefined);
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('keeps the page open when logout fails so the user can retry', async () => {
    const navigate = vi.spyOn(location, 'assign').mockImplementation(() => undefined);
    auth.signOut.mockResolvedValueOnce({ error: new Error('退出失败') });
    await expect(service.signOut()).rejects.toThrow('退出失败');
    expect(navigate).not.toHaveBeenCalled();
  });
});
