import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { validateSupabaseAuthConfig, type SupabaseAuthConfig } from './supabase-auth-config';
export { readSupabaseAuthConfig } from './supabase-auth-config';

export interface SupabaseAuthUser {
  id: string;
  email: string | null;
}
export type SupabaseAuthMode = 'sign-in' | 'sign-up';
export interface SupabaseAuthState {
  status: 'signed-out' | 'checking' | 'signed-in' | 'unverified';
  user: SupabaseAuthUser | null;
  message: string;
}
export interface ProductAuthorization {
  config: SupabaseAuthConfig;
  session: Session;
  userId: string;
}
export type SupabaseAuthPort = Pick<
  SupabaseClient['auth'],
  'getSession' | 'getUser' | 'signInWithPassword' | 'signUp' | 'signOut' | 'onAuthStateChange' | 'stopAutoRefresh'
>;
export type SupabaseAuthFactory = (config: SupabaseAuthConfig) => Promise<SupabaseAuthPort>;

// Auth sessions never share the local workspace's preferences or backup records.
export const SUPABASE_AUTH_SESSION_KEY = 'aiao-media-supabase-session-v1';
export function authStorageKey(config: SupabaseAuthConfig): string {
  return `${SUPABASE_AUTH_SESSION_KEY}:${encodeURIComponent(config.url)}`;
}

async function sdkAuth(config: SupabaseAuthConfig): Promise<SupabaseAuthPort> {
  // Keep the SDK out of the initial bundle, and never instantiate it without configuration.
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(config.url, config.anonKey, {
    auth: {
      storageKey: authStorageKey(config),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15000)])
        })
    }
  }).auth;
}

function account(user: User): SupabaseAuthUser {
  return { id: user.id, email: user.email ?? null };
}
function authError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  const status = (error as { status?: number })?.status;
  const message =
    code === 'invalid_credentials' ? '邮箱或密码不正确。'
    : code === 'email_not_confirmed' ? '请先完成邮箱确认，再登录。'
    : status === 429 || code === 'over_email_send_rate_limit' ? '账号请求过于频繁，请稍后再试。'
    : code === 'weak_password' ? '密码不符合账号服务的要求，请设置更强的密码。'
    : '账号服务暂不可用，请重试。本机创作仍可继续。';
  // Do not surface arbitrary upstream text, which could include credentials or personal data.
  return new Error(message);
}

export class SupabaseAuthClient {
  private current: SupabaseAuthState = {
    status: 'signed-out',
    user: null,
    message: ''
  };
  private readonly listeners = new Set<(state: SupabaseAuthState) => void>();
  private client: Promise<SupabaseAuthPort> | null = null;
  private subscription?: { unsubscribe(): void };
  private generation = 0;
  private disposed = false;
  private mutating = false;
  private restoring: Promise<void> | null = null;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  readonly config: SupabaseAuthConfig;
  get state(): SupabaseAuthState {
    return structuredClone(this.current);
  }

  constructor(
    config: SupabaseAuthConfig,
    private readonly factory: SupabaseAuthFactory = sdkAuth
  ) {
    this.config = validateSupabaseAuthConfig(config);
  }
  subscribe(listener: (state: SupabaseAuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  restore(): Promise<void> {
    if (this.disposed || this.mutating) return Promise.resolve();
    if (this.restoring) return this.restoring;
    const generation = this.generation;
    this.publish({ status: 'checking', user: null, message: '' });
    const pending = this.verify(generation).finally(() => {
      if (this.restoring === pending) this.restoring = null;
    });
    this.restoring = pending;
    return pending;
  }
  async signIn(email: string, password: string): Promise<void> {
    await this.authenticate('sign-in', email, password);
  }
  async signUp(email: string, password: string): Promise<void> {
    await this.authenticate('sign-up', email, password);
  }
  async authorizeProduct(): Promise<ProductAuthorization> {
    const generation = this.generation;
    const userId = this.current.status === 'signed-in' ? this.current.user?.id : null;
    if (!userId) throw new Error('请先验证当前账号。');
    const port = await this.port();
    const { data, error } = await port.getSession();
    if (
      error ||
      !data.session ||
      !this.validSession(data.session) ||
      data.session.user.id !== userId ||
      this.stale(generation)
    )
      throw new Error('账号会话已变化，远程操作未执行。');
    const verified = await port.getUser(data.session.access_token);
    if (verified.error || verified.data.user?.id !== userId || this.stale(generation))
      throw new Error('当前账号尚未通过服务端验证。');
    return { config: this.config, session: data.session, userId };
  }
  async signOut(): Promise<void> {
    ++this.generation;
    this.clearExpiry();
    // Invalidate application authorization before any potentially slow network operation.
    this.publish({ status: 'signed-out', user: null, message: '' });
    this.mutating = true;
    try {
      const port = await this.port();
      const { error } = await port.signOut({ scope: 'local' });
      if (error) throw authError(error);
    } finally {
      try {
        localStorage.removeItem(authStorageKey(this.config));
      } catch {
        /* storage may be unavailable */
      }
      this.mutating = false;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.clearExpiry();
    this.subscription?.unsubscribe();
    this.listeners.clear();
    void this.client?.then(port => port.stopAutoRefresh()).catch(() => undefined);
  }
  private publish(state: SupabaseAuthState) {
    if (this.disposed) return;
    this.current = state;
    for (const listener of this.listeners) listener(this.state);
  }
  private async port(): Promise<SupabaseAuthPort> {
    if (this.disposed) throw new Error('账号会话已关闭。');
    this.client ??= this.factory(this.config)
      .then(async port => {
        if (this.disposed) {
          await port.stopAutoRefresh();
          throw new Error('账号会话已关闭。');
        }
        this.subscription = port.onAuthStateChange((event: AuthChangeEvent) => {
          if (this.disposed) return;
          if (event === 'SIGNED_OUT') {
            ++this.generation;
            this.clearExpiry();
            this.publish({ status: 'signed-out', user: null, message: '' });
          } else if (!this.mutating && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
            // Supabase invokes callbacks while coordinating its session; do async work after it releases that lock.
            queueMicrotask(() => {
              if (!this.disposed) void this.restore();
            });
          }
        }).data.subscription;
        return port;
      })
      .catch((error: unknown) => {
        this.client = null;
        throw error;
      });
    return this.client;
  }
  private async verify(generation: number): Promise<void> {
    try {
      const port = await this.port();
      const { data, error } = await port.getSession();
      if (this.stale(generation)) return;
      if (error) throw error;
      const session = data.session;
      if (!session) {
        this.clearExpiry();
        this.publish({ status: 'signed-out', user: null, message: '' });
        return;
      }
      // A locally cached user or an expired token is not evidence of a valid server session.
      if (!this.validSession(session)) throw new Error('expired');
      const result = await port.getUser(session.access_token);
      if (this.stale(generation)) return;
      if (result.error || !result.data.user || result.data.user.id !== session.user.id)
        throw result.error ?? new Error('invalid_user');
      if (!this.validSession(session)) throw new Error('expired');
      this.accept(session, result.data.user);
    } catch {
      if (!this.stale(generation)) {
        this.clearExpiry();
        this.publish({
          status: 'unverified',
          user: null,
          message: '账号会话尚未验证，请联网后重试。本机创作仍可继续。'
        });
      }
      // Keep SDK refresh credentials on transient failures; never show them as a verified login.
    }
  }
  private stale(generation: number) {
    return this.disposed || generation !== this.generation;
  }
  private validSession(session: Session): boolean {
    return Boolean(
      session.access_token &&
      session.user?.id &&
      Number.isFinite(session.expires_at) &&
      session.expires_at! > Date.now() / 1000
    );
  }
  private clearExpiry() {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }
  private accept(session: Session, user: User) {
    this.publish({ status: 'signed-in', user: account(user), message: '' });
    this.clearExpiry();
    this.expiryTimer = setTimeout(
      () => {
        this.publish({
          status: 'unverified',
          user: null,
          message: '账号会话已过期，正在重新验证。'
        });
        void this.restore();
      },
      Math.min(2147483647, Math.max(0, session.expires_at! * 1000 - Date.now()))
    );
  }
  private async authenticate(mode: SupabaseAuthMode, email: string, password: string): Promise<void> {
    email = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || (mode === 'sign-up' && password.length < 6))
      throw new Error('请输入有效邮箱和密码；注册密码至少 6 位。');
    if (this.mutating || this.disposed) return;
    this.mutating = true;
    const generation = ++this.generation;
    this.clearExpiry();
    try {
      const port = await this.port();
      const credentials = { email, password };
      const { data, error } =
        mode === 'sign-in' ? await port.signInWithPassword(credentials) : await port.signUp(credentials);
      if (this.stale(generation)) return;
      if (error) throw error;
      if (data.session && this.validSession(data.session)) this.accept(data.session, data.session.user);
      else if (mode === 'sign-up' && data.user)
        this.publish({
          status: 'signed-out',
          user: null,
          message: '请检查邮箱并完成确认，然后回来登录。'
        });
      else throw authError(null);
    } catch (error) {
      if (this.stale(generation)) return;
      this.publish({ status: 'signed-out', user: null, message: '' });
      throw authError(error);
    } finally {
      this.mutating = false;
    }
  }
}
