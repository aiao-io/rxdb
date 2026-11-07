import { createAiResponse, type AiEnvironment } from '../ai';
import { AuthError, authRoute, verifySession, withSessionCookies, type AuthEnvironment } from './auth';

/** 前端和模型 AI 接口共用的 Worker 绑定。 */
export interface EdgeEnvironment extends AuthEnvironment, AiEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** 模型 AI 请求边界，供路由测试注入。 */
export type AiFetch = (request: Request) => Promise<Response>;

function isCrossSiteWrite(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.headers.get('origin');
  return origin !== null ?
      origin !== new URL(request.url).origin
    : request.headers.get('sec-fetch-site') === 'cross-site';
}

/** 同源静态前端、登录会话和模型 AI 入口。 */
export async function routeRequest(
  request: Request,
  env: EdgeEnvironment,
  aiFetch: AiFetch = request => createAiResponse(request, env)
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/health') return Response.json({ ok: true });
  if (!/^\/(?:api|bff)(?:\/|$)/.test(path)) return env.ASSETS.fetch(request);
  if (isCrossSiteWrite(request))
    return Response.json(
      { type: 'unauthorized', message: 'Cross-origin request rejected', status: 403 },
      { status: 403 }
    );
  try {
    if (path.startsWith('/bff/auth/')) return await authRoute(request, env);
    if (!['/api/ai/model/generate', '/api/ai/model/chat'].includes(path))
      return Response.json({ error: 'not_found' }, { status: 404 });
    if (request.method !== 'POST')
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'POST' } });
    const session = await verifySession(request, env);
    if (!session.user)
      return withSessionCookies(
        Response.json({ type: 'unauthorized', message: 'Sign in to use model AI', status: 401 }, { status: 401 }),
        session.cookies
      );
    return withSessionCookies(await aiFetch(request), session.cookies);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 502;
    const message = error instanceof AuthError ? error.message : 'Model AI service is unavailable';
    return Response.json(
      { type: status === 401 ? 'unauthorized' : 'server', message, status },
      { status, headers: { 'cache-control': 'no-store' } }
    );
  }
}
