/**
 * Worker 的路由。前端静态资源由 Workers Static Assets 直接回应，
 * 只有 `/api/*` 与 `/app-config.js` 进到这里（`wrangler.jsonc` 的 `run_worker_first`）。
 *
 * - `/app-config.js`：把公开的 Supabase 地址与 anon key 交给前端，换环境不必重新构建
 * - `/api/signal`：信令 WebSocket，交给唯一的信令房间
 * - `/api/files/:contentHash`：服务器回退的上传与下载（R2）
 * - `/api/admin/*`：管理后台（US-713），先验管理员再动账号、信令与 R2
 */
import { ADMIN_ROUTE_PREFIX, handleAdminRequest, type AdminRouteDeps } from './admin';
import { adminConfigOf } from './admin-config';
import { createAdminRoom } from './admin-room';
import { supabaseConfigOf, type Env } from './env';
import { handleEncryptedFileRequest, handleFileRequest } from './files';
import { json } from './http';
import { verifyAccessToken } from './identity';

/** 全部设备共用的信令房间：读范围同部署（US-704 In Scope）。 */
export const SIGNALING_ROOM = 'lobby';

const FILE_ROUTE = /^\/api\/files\/([^/]+)$/;
const ENC_FILE_ROUTE = /^\/api\/files\/enc\/([^/]+)$/;

const appConfig = (env: Env): Response => {
  const { url, anonKey } = supabaseConfigOf(env);
  const body = `globalThis.__P2P_CONFIG__ = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey })};\n`;
  return new Response(body, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }
  });
};

/** 文件路由里认证宿主或 R2 出错：照 files.ts 的约定回 502；原文只进日志，宿主的报错不回给调用方。 */
const fileRouteFailed = (error: unknown): Response => {
  console.error('[p2p] file route failed', error);
  return json(502, { error: 'the authentication host or file storage is unavailable' });
};

const adminDepsOf = (env: Env): AdminRouteDeps => ({
  verifyUser: token => verifyAccessToken(supabaseConfigOf(env), token),
  config: () => adminConfigOf(env),
  room: createAdminRoom(env.SIGNALING, SIGNALING_ROOM),
  bucket: env.FILES
});

/** 路由一个请求。 */
export const handleRequest = async (request: Request, env: Env): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === '/app-config.js') return appConfig(env);
  if (pathname === '/api/signal') return env.SIGNALING.get(env.SIGNALING.idFromName(SIGNALING_ROOM)).fetch(request);
  if (pathname.startsWith(ADMIN_ROUTE_PREFIX)) return handleAdminRequest(request, adminDepsOf(env));
  const verifyUser = (token: string) => verifyAccessToken(supabaseConfigOf(env), token);
  const encrypted = ENC_FILE_ROUTE.exec(pathname);
  if (encrypted?.[1]) {
    return handleEncryptedFileRequest(request, encrypted[1], { bucket: env.FILES, verifyUser }).catch(fileRouteFailed);
  }
  const file = FILE_ROUTE.exec(pathname);
  if (file?.[1]) {
    return handleFileRequest(request, file[1], { bucket: env.FILES, verifyUser }).catch(fileRouteFailed);
  }
  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  });
};
