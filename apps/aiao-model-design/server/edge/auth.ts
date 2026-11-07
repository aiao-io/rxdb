/** Worker 使用的 Supabase 配置，只由服务端绑定提供。 */
export interface AuthEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface AuthUser {
  id: string;
  email?: string;
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

/** 验证后的用户会话及需要写回的 cookie。 */
export interface VerifiedSession {
  user: AuthUser | null;
  cookies: string[];
}

/** 带 HTTP 状态码的认证错误。 */
export class AuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function readCookie(request: Request, name: string): string | null {
  const segment = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  if (!segment) return null;
  try {
    return decodeURIComponent(segment.slice(name.length + 1)) || null;
  } catch {
    return null;
  }
}

function accessToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  return readCookie(request, 'access_token') ?? authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

function cookie(request: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge)}${secure}`;
}

function clearCookies(request: Request): string[] {
  return [cookie(request, 'access_token', '', 0), cookie(request, 'refresh_token', '', 0)];
}

function sessionCookies(request: Request, session: SupabaseSession): string[] {
  return [cookie(request, 'access_token', session.access_token, session.expires_in), cookie(request, 'refresh_token', session.refresh_token, 30 * 24 * 60 * 60)];
}

async function supabase(env: AuthEnvironment, path: string, init?: RequestInit): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new AuthError(503, 'Supabase Auth is not configured');
  const headers = new Headers(init?.headers);
  headers.set('apikey', env.SUPABASE_ANON_KEY);
  headers.set('content-type', 'application/json');
  try {
    return await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new AuthError(502, 'Authentication service is unavailable');
  }
}

function isUser(value: unknown): value is AuthUser {
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';
}

function isSession(value: unknown): value is SupabaseSession {
  if (typeof value !== 'object' || value === null) return false;
  return 'access_token' in value && typeof value.access_token === 'string' &&
    'refresh_token' in value && typeof value.refresh_token === 'string' &&
    'expires_in' in value && typeof value.expires_in === 'number' && value.expires_in > 0 &&
    'user' in value && isUser(value.user);
}

/** 获取 Supabase 用户，过期的会话使用 refresh token 更新。 */
export async function verifySession(request: Request, env: AuthEnvironment): Promise<VerifiedSession> {
  const token = accessToken(request);
  if (token) {
    const response = await supabase(env, 'user', { headers: { authorization: `Bearer ${token}` } });
    if (response.ok) {
      const user: unknown = await response.json();
      if (!isUser(user)) throw new AuthError(502, 'Authentication response is invalid');
      return { user, cookies: [] };
    }
    if (response.status >= 500) throw new AuthError(502, 'Authentication service is unavailable');
  }
  const refreshToken = readCookie(request, 'refresh_token');
  if (!refreshToken) return { user: null, cookies: token ? clearCookies(request) : [] };
  const response = await supabase(env, 'token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
  if (response.status >= 500) throw new AuthError(502, 'Authentication service is unavailable');
  const session: unknown = response.ok ? await response.json() : null;
  return isSession(session) ? { user: session.user, cookies: sessionCookies(request, session) } : { user: null, cookies: clearCookies(request) };
}

async function signIn(request: Request, env: AuthEnvironment): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('email' in body) || typeof body.email !== 'string' || !body.email.trim() || !('password' in body) || typeof body.password !== 'string' || !body.password) {
    throw new AuthError(400, 'Email and password are required');
  }
  const response = await supabase(env, 'token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: body.email, password: body.password }) });
  if (response.status >= 500) throw new AuthError(502, 'Authentication service is unavailable');
  if (!response.ok) throw new AuthError(401, 'Email or password is invalid');
  const session: unknown = await response.json();
  if (!isSession(session)) throw new AuthError(502, 'Authentication response is invalid');
  return withSessionCookies(Response.json({ user: session.user }), sessionCookies(request, session));
}

/** 给代理响应追加认证 cookie，保留流式响应体和下载头。 */
export function withSessionCookies(response: Response, cookies: readonly string[]): Response {
  const headers = new Headers(response.headers);
  for (const value of cookies) headers.append('set-cookie', value);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** 同源认证入口，JWT 只写入 HttpOnly cookie。 */
export async function authRoute(request: Request, env: AuthEnvironment): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/bff/auth/signin' && request.method === 'POST') return signIn(request, env);
  if (path === '/bff/auth/session' && request.method === 'GET') {
    const session = await verifySession(request, env);
    return withSessionCookies(Response.json({ user: session.user }), session.cookies);
  }
  if (path === '/bff/auth/signout' && request.method === 'POST') {
    const token = accessToken(request);
    if (token) await supabase(env, 'logout?scope=local', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
    return withSessionCookies(Response.json({ error: null }), clearCookies(request));
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
}
