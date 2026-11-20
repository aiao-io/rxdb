import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export interface AdminSupabaseConfig {
  url: string;
  anonKey: string;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: number;
  user: { id: string; email?: string | null };
}

export interface AdminSupabaseClient {
  auth: Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'signInWithPassword' | 'signOut'>;
  functions: Pick<SupabaseClient['functions'], 'invoke'>;
}
export type AdminSupabaseFactory = (config: AdminSupabaseConfig) => Promise<AdminSupabaseClient>;

export const ADMIN_SUPABASE_SESSION_KEY = 'aiao-media-admin-supabase-session-v1';

function validateConfig(config: AdminSupabaseConfig): AdminSupabaseConfig {
  const url = new URL(config.url.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Supabase URL 无效。');
  const anonKey = config.anonKey.trim();
  if (!anonKey || anonKey.includes('service_role') || anonKey.includes('secret'))
    throw new Error('Supabase 公开 Key 无效。');
  return { url: url.origin, anonKey };
}

function validSession(session: Session | null): session is Session {
  return Boolean(
    session?.access_token &&
    session.user?.id &&
    Number.isFinite(session.expires_at) &&
    (session.expires_at ?? 0) > Date.now() / 1000
  );
}

function toSession(session: Session): AdminSession {
  return {
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000,
    user: { id: session.user.id, email: session.user.email }
  };
}

function authError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  const status = (error as { status?: number })?.status;
  return new Error(
    code === 'invalid_credentials' ? '邮箱或密码不正确。'
    : code === 'email_not_confirmed' ? '请先完成邮箱确认，再登录。'
    : status === 429 ? '账号请求过于频繁，请稍后再试。'
    : '账号服务暂不可用，请重试。'
  );
}

/** 后台访问 Supabase 的统一请求约束：不带 Cookie、不缓存、不跟随跳转、15 秒超时。 */
function hardenedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(15000)])
  });
}

async function defaultFactory(config: AdminSupabaseConfig): Promise<AdminSupabaseClient> {
  return createClient(config.url, config.anonKey, {
    auth: {
      storageKey: `${ADMIN_SUPABASE_SESSION_KEY}:${encodeURIComponent(config.url)}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    global: { fetch: hardenedFetch }
  });
}

/**
 * 创建配置同步专用的 Supabase 客户端：每次请求与 Realtime 连接都向登录会话取当前访问令牌。
 *
 * @param config - 账号服务地址与公开 Key
 * @param accessToken - 返回当前管理员普通 JWT；会话失效时应抛错
 * @returns 只用于 RxDB 远端适配器的客户端，不持久化会话、不刷新令牌
 */
export function createAdminSupabaseSyncClient(
  config: AdminSupabaseConfig,
  accessToken: () => Promise<string>
): SupabaseClient {
  const valid = validateConfig(config);
  return createClient(valid.url, valid.anonKey, {
    accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: hardenedFetch }
  });
}

export class AdminSupabaseAuth {
  private client: Promise<AdminSupabaseClient> | null = null;
  private current: AdminSession | null = null;
  readonly config: AdminSupabaseConfig;

  get session(): AdminSession | null {
    return this.current ? structuredClone(this.current) : null;
  }

  constructor(
    config: AdminSupabaseConfig,
    private readonly factory: AdminSupabaseFactory = defaultFactory
  ) {
    this.config = validateConfig(config);
  }

  async restore(legacy: AdminSession | null): Promise<AdminSession | null> {
    const client = await this.port();
    try {
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      if (validSession(result.data.session)) {
        const verified = await client.auth.getUser(result.data.session.access_token);
        if (!verified.error && verified.data.user?.id === result.data.session.user.id) {
          this.current = toSession(result.data.session);
          return this.session;
        }
      }
      if (legacy && legacy.expiresAt > Date.now()) {
        const verified = await client.auth.getUser(legacy.accessToken);
        if (!verified.error && verified.data.user?.id === legacy.user.id) {
          this.current = legacy;
          return this.session;
        }
      }
    } catch {
      this.current = null;
    }
    this.current = null;
    return null;
  }

  async signIn(email: string, password: string): Promise<AdminSession> {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 1)
      throw new Error('请输入有效邮箱和密码。');
    try {
      const result = await (await this.port()).auth.signInWithPassword({ email: normalizedEmail, password });
      if (result.error || !validSession(result.data.session)) throw result.error ?? new Error('invalid_session');
      const verified = await (await this.port()).auth.getUser(result.data.session.access_token);
      if (verified.error || verified.data.user?.id !== result.data.session.user.id)
        throw verified.error ?? new Error('invalid_user');
      this.current = toSession(result.data.session);
      return this.session!;
    } catch (error) {
      this.current = null;
      throw authError(error);
    }
  }

  async authorization(): Promise<{
    config: AdminSupabaseConfig;
    session: { access_token: string };
    userId: string;
    supabase: AdminSupabaseClient;
  }> {
    const current = this.current;
    if (!current || current.expiresAt <= Date.now()) throw new Error('请先验证当前账号。');
    return {
      config: this.config,
      session: { access_token: current.accessToken },
      userId: current.user.id,
      supabase: await this.port()
    };
  }

  async signOut(): Promise<void> {
    this.current = null;
    const client = await this.port();
    const result = await client.auth.signOut({ scope: 'local' });
    if (result.error) throw authError(result.error);
  }

  private port(): Promise<AdminSupabaseClient> {
    this.client ??= this.factory(this.config).catch(error => {
      this.client = null;
      throw error;
    });
    return this.client;
  }
}
