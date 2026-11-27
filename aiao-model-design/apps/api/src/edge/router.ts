import { agentConfig, startAgentSession, type AgentEnvironment } from '../agent-session';
import { AuthError, authRoute, verifySession, withSessionCookies, type AuthEnvironment } from './auth';

/** 前端、登录会话与智能体会话签发共用的 Worker 绑定。 */
export interface EdgeEnvironment extends AuthEnvironment, AgentEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function isCrossSiteWrite(request: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const origin = request.headers.get('origin');
  return origin !== null ?
      origin !== new URL(request.url).origin
    : request.headers.get('sec-fetch-site') === 'cross-site';
}

function methodNotAllowed(allow: string): Response {
  return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { allow } });
}

async function agentSessionRoute(request: Request, env: EdgeEnvironment): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const session = await verifySession(request, env);
  if (!session.user)
    return withSessionCookies(
      Response.json({ type: 'unauthorized', message: 'Sign in to use model AI', status: 401 }, { status: 401 }),
      session.cookies
    );
  return withSessionCookies(await startAgentSession(request, env, session.user.id), session.cookies);
}

async function apiRoute(request: Request, env: EdgeEnvironment, path: string): Promise<Response> {
  if (path.startsWith('/bff/auth/')) return authRoute(request, env);
  if (path === '/api/agent/config') return request.method === 'GET' ? agentConfig(env) : methodNotAllowed('GET');
  if (path === '/api/agent/session') return agentSessionRoute(request, env);
  return Response.json({ error: 'not_found' }, { status: 404 });
}

/**
 * 同源静态前端、登录会话与智能体会话签发入口。
 *
 * 建模 AI 本身运行在 Trigger.dev 实例上；Worker 只为已登录用户签发会话令牌，不持有模型密钥。
 */
export async function routeRequest(request: Request, env: EdgeEnvironment): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/health') return Response.json({ ok: true });
  if (!/^\/(?:api|bff)(?:\/|$)/.test(path)) return env.ASSETS.fetch(request);
  if (isCrossSiteWrite(request))
    return Response.json(
      { type: 'unauthorized', message: 'Cross-origin request rejected', status: 403 },
      { status: 403 }
    );
  try {
    return await apiRoute(request, env, path);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 502;
    const message = error instanceof AuthError ? error.message : 'Model agent service is unavailable';
    return Response.json(
      { type: status === 401 ? 'unauthorized' : 'server', message, status },
      { status, headers: { 'cache-control': 'no-store' } }
    );
  }
}
