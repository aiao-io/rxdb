import { AuthError, authRoute, verifySession, withSessionCookies, type AuthEnvironment } from './auth';

/** Cloudflare 入口的服务端绑定。 */
export interface EdgeEnvironment extends AuthEnvironment {
  MODEL_DESIGNER_BACKEND_TOKEN?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** 容器 HTTP 请求边界，供 Worker 和代理测试复用。 */
export type ApiFetch = (request: Request) => Promise<Response>;

function isCrossSiteWrite(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.headers.get('origin');
  return origin !== null ? origin !== new URL(request.url).origin : request.headers.get('sec-fetch-site') === 'cross-site';
}

function upstreamRequest(request: Request, path: string, token?: string): Request {
  const url = new URL(request.url);
  url.pathname = path;
  const headers = new Headers(request.headers);
  headers.delete('cf-container-target-port');
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
    headers.delete('cookie');
  }
  return new Request(new Request(url, request), { headers });
}

async function designerProxy(request: Request, env: EdgeEnvironment, apiFetch: ApiFetch): Promise<Response> {
  const session = await verifySession(request, env);
  if (!session.user) return withSessionCookies(Response.json({ error: 'unauthorized' }, { status: 401 }), session.cookies);
  const token = env.MODEL_DESIGNER_BACKEND_TOKEN?.trim();
  if (!token) throw new AuthError(503, 'MODEL_DESIGNER_BACKEND_TOKEN is required');
  const path = new URL(request.url).pathname.replace(/^\/bff\//, '/api/');
  return withSessionCookies(await apiFetch(upstreamRequest(request, path, token)), session.cookies);
}

/** 同源前端、认证、SQL BFF 与原网关入口。 */
export async function routeRequest(request: Request, env: EdgeEnvironment, apiFetch: ApiFetch): Promise<Response> {
  const path = new URL(request.url).pathname;
  const backend = /^\/(?:api|bff|v1)(?:\/|$)/.test(path) || path === '/health' || path.startsWith('/openapi');
  if (!backend) return env.ASSETS.fetch(request);
  if (isCrossSiteWrite(request)) return Response.json({ error: 'cross_origin_request' }, { status: 403 });
  try {
    if (path.startsWith('/bff/auth/')) return await authRoute(request, env);
    if (path.startsWith('/bff/model-designer/') || path.startsWith('/api/model-designer/')) return await designerProxy(request, env, apiFetch);
    if (path.startsWith('/bff/')) return Response.json({ error: 'not_found' }, { status: 404 });
    return await apiFetch(upstreamRequest(request, path));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: 'authentication_error', message: error.message }, { status: error.status, headers: { 'cache-control': 'no-store' } });
    return Response.json({ error: 'backend_unavailable', message: 'Model Design API is unavailable' }, { status: 502 });
  }
}
