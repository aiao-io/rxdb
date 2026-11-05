/**
 * Worker 的路由。前端静态资源由 Workers Static Assets 直接回应，
 * 只有 `/api/*` 与 `/app-config.js` 进到这里（`wrangler.jsonc` 的 `run_worker_first`）。
 *
 * - `/app-config.js`：把公开的 Supabase 地址与 anon key 交给前端，换环境不必重新构建
 * - `/api/signal`：信令 WebSocket，交给唯一的信令房间
 * - `/api/files/:contentHash`：服务器回退的上传与下载（R2）
 * - `/api/files/enc/:encHash`：密文回退（POOL-US-101）
 * - `/api/reports`：举报提交（POOL-US-102）
 * - `/api/me` / `/api/invite`：邀请制激活（POOL-US-102）
 * - `/api/admin/*`：管理后台（US-713 + POOL-US-102 的举报处置与邀请码）
 */
import { ADMIN_ROUTE_PREFIX, handleAdminRequest, type AdminRouteDeps } from './admin';
import { adminConfigOf, isAdminUserId } from './admin-config';
import { createAdminRoom } from './admin-room';
import { createInviteDirectory, createReportDirectory } from './admin-supabase';
import { requireActivation, supabaseConfigOf, type Env } from './env';
import { handleEncryptedFileRequest, handleFileRequest, limited } from './files';
import { json } from './http';
import { isActivatedUser, verifyAccessToken } from './identity';
import { handleInviteRequest } from './invites';
import { handleReportRequest } from './reports';

/** 全部设备共用的信令房间：读范围同部署（US-704 In Scope）。 */
export const SIGNALING_ROOM = 'lobby';
/** 限流 Durable Object 的静态名称。 */
export const POOL_LIMITER = 'pool-limiter';

const FILE_ROUTE = /^\/api\/files\/([^/]+)$/;
const ENC_FILE_ROUTE = /^\/api\/files\/enc\/([^/]+)$/;

const appConfig = (env: Env): Response => {
  const { url, anonKey } = supabaseConfigOf(env);
  const body = `globalThis.__P2P_CONFIG__ = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey })};\n`;
  return new Response(body, {
    headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }
  });
};

/** 限流调用：全部经一个 DO，跨 isolate 共享窗口计数；`cost` 为 0 时只查不记。 */
const limiterOf = (env: Env) => {
  const stub = () => env.LIMITER.get(env.LIMITER.idFromName(POOL_LIMITER));
  const call = async (
    scope: string,
    key: string,
    cost: number
  ): Promise<{ readonly allowed: boolean; readonly retryAfterMs: number }> => {
    const response = await stub().fetch(
      new Request('http://limiter.internal/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, key, cost })
      })
    );
    if (!response.ok) throw new Error(`limiter responded ${response.status}`);
    return (await response.json()) as { readonly allowed: boolean; readonly retryAfterMs: number };
  };
  return {
    consume: (scope: string, key: string, cost = 1) => call(scope, key, cost),
    check: (scope: string, key: string) => call(scope, key, 0)
  };
};

/** 文件路由里认证宿主或 R2 出错：照 files.ts 的约定回 502；原文只进日志，宿主的报错不回给调用方。 */
const fileRouteFailed = (error: unknown): Response => {
  console.error('[p2p] file route failed', error);
  return json(502, { error: 'the authentication host or file storage is unavailable' });
};

/** 举报与邀请路由的上游（Supabase）故障：回 502。 */
const upstreamFailed = (error: unknown): Response => {
  console.error('[p2p] governance route failed', error);
  return json(502, { error: 'the authentication host or database is unavailable' });
};

const adminDepsOf = (env: Env): AdminRouteDeps => {
  const { url, fetch } = supabaseConfigOf(env);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  return {
    verifyUser: token => verifyAccessToken(supabaseConfigOf(env), token),
    config: () => adminConfigOf(env),
    room: createAdminRoom(env.SIGNALING, SIGNALING_ROOM),
    bucket: env.FILES,
    reports: createReportDirectory({ url, serviceRoleKey, fetch }),
    invites: createInviteDirectory({ url, serviceRoleKey, fetch })
  };
};

const fileDepsOf = (env: Env, ctx?: { readonly waitUntil: (promise: Promise<unknown>) => void }) => {
  const config = supabaseConfigOf(env);
  const limiter = limiterOf(env);
  return {
    bucket: env.FILES,
    verifyUser: (token: string) => verifyAccessToken(config, token),
    consume: limiter.consume,
    check: limiter.check,
    reportBytes: (scope: string, key: string, cost: number) => {
      const accounting = limiter.consume(scope, key, cost);
      if (ctx?.waitUntil) ctx.waitUntil(accounting);
    },
    requireActivation: requireActivation(env),
    isActivated: async (token: string, userId: string) =>
      isAdminUserId(env, userId) || (await isActivatedUser(config, token))
  };
};

/** 路由一个请求。 */
export const handleRequest = async (
  request: Request,
  env: Env,
  ctx?: { readonly waitUntil: (promise: Promise<unknown>) => void }
): Promise<Response> => {
  const { pathname } = new URL(request.url);
  if (pathname === '/app-config.js') return appConfig(env);
  if (pathname === '/api/signal') return env.SIGNALING.get(env.SIGNALING.idFromName(SIGNALING_ROOM)).fetch(request);
  if (pathname === '/api/reports') {
    const config = supabaseConfigOf(env);
    return handleReportRequest(request, {
      verifyUser: token => verifyAccessToken(config, token),
      directory: createReportDirectory({
        url: config.url,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
        fetch: config.fetch
      })
    }).catch(upstreamFailed);
  }
  if (pathname === '/api/me' || pathname === '/api/invite') {
    const config = supabaseConfigOf(env);
    return handleInviteRequest(request, {
      verifyUser: token => verifyAccessToken(config, token),
      requireActivation: requireActivation(env),
      isAdmin: userId => isAdminUserId(env, userId),
      directory: createInviteDirectory({
        url: config.url,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
        fetch: config.fetch
      })
    }).catch(upstreamFailed);
  }
  if (pathname.startsWith(ADMIN_ROUTE_PREFIX)) {
    const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const limiter = limiterOf(env);
    // 防爆破：失败计数超限的来源在进入路由前就被 429 挡下
    const pre = await limiter.check('admin-failed-auth', address);
    if (!pre.allowed) return limited(pre.retryAfterMs);
    const response = await handleAdminRequest(request, adminDepsOf(env));
    if (response.status === 401 || response.status === 403) {
      const accounting = limiter.consume('admin-failed-auth', address);
      if (ctx?.waitUntil) ctx.waitUntil(accounting);
    }
    return response;
  }
  const deps = fileDepsOf(env, ctx);
  const encrypted = ENC_FILE_ROUTE.exec(pathname);
  if (encrypted?.[1]) {
    return handleEncryptedFileRequest(request, encrypted[1], deps).catch(fileRouteFailed);
  }
  const file = FILE_ROUTE.exec(pathname);
  if (file?.[1]) {
    return handleFileRequest(request, file[1], deps).catch(fileRouteFailed);
  }
  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  });
};
