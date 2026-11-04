/**
 * Worker 的路由。前端静态资源由 Workers Static Assets 直接回应，
 * 只有 `/api/*` 与 `/app-config.js` 进到这里（`wrangler.jsonc` 的 `run_worker_first`）。
 *
 * - `/app-config.js`：把公开的 Supabase 地址与 anon key 交给前端，换环境不必重新构建
 * - `/api/signal`：信令 WebSocket，交给唯一的信令房间
 * - `/api/files/:contentHash`：服务器回退的上传与下载（R2）
 */
import { supabaseConfigOf, type Env } from './env';
import { handleFileRequest } from './files';
import { verifyAccessToken } from './identity';

/** 全部设备共用的信令房间：读范围同部署（US-704 In Scope）。 */
export const SIGNALING_ROOM = 'lobby';

const FILE_ROUTE = /^\/api\/files\/([^/]+)$/;

const appConfig = (env: Env): Response => {
  const { url, anonKey } = supabaseConfigOf(env);
  const body = `globalThis.__P2P_CONFIG__ = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey })};\n`;
  return new Response(body, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }
  });
};

/** 路由一个请求。 */
export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === '/app-config.js') return appConfig(env);
  if (pathname === '/api/signal') return env.SIGNALING.get(env.SIGNALING.idFromName(SIGNALING_ROOM)).fetch(request);
  const file = FILE_ROUTE.exec(pathname);
  if (file?.[1]) {
    const verifyUser = (token: string) => verifyAccessToken(supabaseConfigOf(env), token);
    return handleFileRequest(request, file[1], { bucket: env.FILES, verifyUser });
  }
  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  });
};
