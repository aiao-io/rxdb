import { requestBodyLimit } from '../commit.js';
import { CollaborationError, demand, type Identity } from '../model.js';
import { fromUtf8, sha256Hex } from './encoding.js';
import type { HealthReport } from './health.js';
import type { Identities } from './identity.js';
import { parseCommand } from './input.js';
import type { RequestContext } from './monitor.js';
import type { CollaborationRepository } from './repository.js';

/** HTTP 层用到的仓储接口：只有命令写入。读取经 Supabase 的只读投影，不经本服务。 */
export type RepositoryApi = Pick<CollaborationRepository, 'operation'>;
/** fetch 风格的命令处理函数：Node 入口（`http.ts`）与 Supabase Edge Function（`edge.ts`）共用同一个。 */
export type CommandHandler = (request: Request) => Promise<Response>;
/** 命令处理函数的装配项。 */
export interface HandlerOptions {
  repository: RepositoryApi;
  /** 命令入口的身份校验：每个请求本地验签，只有接受邀请时向 Auth 确认邮箱（见 `identity.ts`）。 */
  identities: Identities;
  /** 允许的工作台来源（含协议与端口）。 */
  origins: readonly string[];
  /** 浏览器经 `GET /config` 读取的公开配置。 */
  publicConfig: { supabaseUrl: string; supabaseKey: string };
  /**
   * 入口自身的路径前缀：Supabase 把函数名作为第一段路径交给 Edge Function（`/admin-collaboration/...`），Node 入口没有前缀。
   * 去掉它之后，开发代理带来的 `/collaboration-api` 前缀同样可有可无。
   */
  basePath?: string;
  /**
   * 内部错误（500）的记录钩子：拿到错误与请求的方法和路径，交给上报器脱敏后写运维日志（见 `monitor.ts`），不进入响应。
   * 处理函数等它完成再回 500（上报器自带超时）。
   */
  onError?: (error: unknown, request: RequestContext) => void | Promise<void>;
  /** 健康检查（`GET /health`，不要求令牌）：报告 ok 回 200，否则 503（见 `health.ts`）；不装配时没有这个接口。 */
  health?: () => Promise<HealthReport>;
}
/** 单个请求体的上限：与客户端分批上传用的是同一个常量（`requestBodyLimit`，取值理由见那里）。 */
export const bodyLimit = requestBodyLimit;
/** 可重试的不可用（503）没有给出等待时间时，客户端至少等待的秒数。 */
const defaultRetryAfter = 1;

const statusOf = (code: string) =>
  code === 'unauthenticated' ? 401
  : code === 'forbidden' ? 403
  : code === 'unavailable' ? 503
  : 409;
/** 每个响应都带的头：不缓存、JSON、禁止内容嗅探。 */
function baseHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
}
const json = (body: unknown, status: number, headers: Headers) =>
  new Response(JSON.stringify(body), { status, headers });

/** 不可用错误建议的重试等待（秒）：取自错误详情的 `retryAfter`，没有时为 {@link defaultRetryAfter}。 */
function retryAfterOf(error: CollaborationError): number {
  const value = error.details['retryAfter'];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : defaultRetryAfter;
}

/**
 * 把错误转成响应：已知错误按错误码给出状态（401 / 403 / 503 / 409）与原消息，其余一律 500 `internal`，不透露内部细节。
 * `unavailable`（冷启动依赖不可用、连接池耗尽、数据库超时等，见 `repository.ts`）是可重试的明确错误：503 加 `Retry-After`，
 * 客户端按它用同一个幂等键重发，服务端的回执保证同一操作不会执行两次。
 */
export function errorResponse(error: unknown, headers: Headers = baseHeaders()): Response {
  if (!(error instanceof CollaborationError))
    return json({ error: 'internal', message: '服务暂时不可用，请稍后按原请求重试', details: {} }, 500, headers);
  if (error.code === 'unavailable') headers.set('Retry-After', String(retryAfterOf(error)));
  return json({ error: error.code, message: error.message, details: error.details }, statusOf(error.code), headers);
}

/** 去掉路径开头的前缀（只按整段匹配）。 */
function stripPrefix(pathname: string, prefix: string): string {
  if (!prefix) return pathname;
  if (pathname === prefix) return '/';
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}
/** 把路径拆成已解码的路径段；残缺的百分号编码是客户端错误，不是服务端故障。 */
function pathSegments(pathname: string, basePath: string): string[] {
  try {
    return stripPrefix(stripPrefix(pathname, basePath), '/collaboration-api')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    throw new CollaborationError('invalid', '请求格式错误');
  }
}

/** 读完请求体并检查上限：超过上限立即停止读取并拒绝。 */
async function collect(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    length += next.value.byteLength;
    if (length > bodyLimit) {
      await reader.cancel().catch(() => undefined);
      throw new CollaborationError('limit', '请求不能超过 4 MiB');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function readJson(request: Request): Promise<unknown> {
  demand(!(Number(request.headers.get('content-length')) > bodyLimit), 'limit', '请求不能超过 4 MiB');
  const bytes = request.body ? await collect(request.body) : new Uint8Array();
  try {
    return JSON.parse(fromUtf8(bytes)) as unknown;
  } catch {
    throw new CollaborationError('invalid', 'JSON 格式错误');
  }
}

/**
 * 唯一的业务接口：`POST /workspaces/:teamId/:appId/commands`。接受邀请前先向 Auth 确认邮箱（以 Auth 的已验证邮箱为准），
 * 其余命令直接使用本地验签得到的身份，成员关系与权限由仓储在命令事务里按成员表裁决。
 */
async function route(request: Request, path: string[], token: string, user: Identity, options: HandlerOptions) {
  demand(
    request.method === 'POST' &&
      path[0] === 'workspaces' &&
      path[1] &&
      path[2] &&
      path[3] === 'commands' &&
      path.length === 4,
    'not_found',
    '接口不存在'
  );
  const [, teamId, appId] = path;
  demand(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'invalid', '需要 JSON 请求');
  const command = parseCommand(await readJson(request));
  if (command.type === 'invite' || command.type === 'accept_invite')
    command.tokenHash = await sha256Hex(command.tokenHash);
  const actor = command.type === 'accept_invite' ? await options.identities.confirm(token, user) : user;
  return options.repository.operation(actor, teamId, appId, command);
}

/**
 * 协作命令入口的处理函数：浏览器只能读取公开配置与提交命令，监控另可访问健康检查（`GET /health`）。用户身份来自每个请求本地验签的 Supabase access token，
 * 稳态下不访问 Auth；接受邀请时才向 Auth 确认邮箱已验证并与邀请匹配。来源不在白名单里的请求一律拒绝；
 * 跨源调用时额外暴露 `Retry-After` 与 `Server-Timing`，浏览器脚本才能读到可重试错误的等待时间与服务端耗时。
 * 每个响应都带 `Server-Timing: app;dur=<毫秒>`：本处理函数自己的耗时（不含网关、Edge Function 冷启动与网络），
 * 监控与预算核对据此区分服务端耗时与端到端耗时（ADMIN-US-217 AC#6）。
 */
export function commandHandler(options: HandlerOptions): CommandHandler {
  return async request => {
    const started = performance.now();
    const response = await respond(request, options);
    response.headers.set('Server-Timing', `app;dur=${(performance.now() - started).toFixed(1)}`);
    return response;
  };
}

/** 处理一个请求（不含计时）：来源与预检、公开配置、健康检查、身份校验与命令路由，错误统一转成响应。 */
async function respond(request: Request, options: HandlerOptions): Promise<Response> {
  const headers = baseHeaders();
  try {
    const origin = request.headers.get('origin');
    demand(!origin || options.origins.includes(origin), 'forbidden', '来源未获授权');
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Expose-Headers', 'Retry-After, Server-Timing');
      headers.set('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      return new Response(null, { status: 204, headers });
    }
    const path = pathSegments(new URL(request.url).pathname, options.basePath ?? '');
    if (request.method === 'GET' && path.join('/') === 'config') return json(options.publicConfig, 200, headers);
    if (request.method === 'GET' && path.join('/') === 'health' && options.health) {
      const report = await options.health();
      return json(report, report.status === 'ok' ? 200 : 503, headers);
    }
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    demand(token, 'unauthenticated', '请登录');
    const user = await options.identities.verify(token);
    return json(await route(request, path, token, user, options), 200, headers);
  } catch (error) {
    if (!(error instanceof CollaborationError))
      await options.onError?.(error, { method: request.method, path: new URL(request.url).pathname });
    return errorResponse(error, headers);
  }
}
