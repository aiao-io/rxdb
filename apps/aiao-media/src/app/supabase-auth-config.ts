export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

export function validateSupabaseAuthConfig(value: unknown): SupabaseAuthConfig {
  if (!value || typeof value !== 'object') throw new Error('账号配置无效。');
  const data = value as Record<string, unknown>;
  if (typeof data['url'] !== 'string' || typeof data['anonKey'] !== 'string')
    throw new Error('请同时配置 Supabase URL 和公开 Key。');
  const url = new URL(data['url'].trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Supabase URL 必须是 HTTPS 项目地址（本机回环地址可用 HTTP），不能包含路径或凭据。');
  const anonKey = data['anonKey'].trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey)) {
    try {
      const segments = anonKey.split('.');
      const payload = JSON.parse(atob(segments[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (segments.length !== 3 || payload.role !== 'anon' || !/^[A-Za-z0-9._-]+$/.test(anonKey)) throw new Error();
    } catch {
      throw new Error('只能使用 Supabase publishable key 或 anon key，不能使用服务端密钥。');
    }
  }
  return { url: url.origin, anonKey };
}

export function readSupabaseAuthConfig(scope: unknown = globalThis): SupabaseAuthConfig | null {
  const value = (scope as { __AIAO_SUPABASE_CONFIG__?: unknown })?.__AIAO_SUPABASE_CONFIG__;
  if (value == null) return null;
  return validateSupabaseAuthConfig(value);
}
