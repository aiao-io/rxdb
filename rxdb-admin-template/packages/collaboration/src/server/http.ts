import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CollaborationError, demand, type Identity } from '../model.js';
import type { Identities } from './identity.js';
import { parseCommand } from './input.js';
import type { CollaborationRepository } from './repository.js';
/** HTTP 层用到的仓储接口：只有命令写入。读取经 Supabase 的只读投影，不经本服务。 */
export type RepositoryApi = Pick<CollaborationRepository, 'operation'>;
interface ServerOptions {
  repository: RepositoryApi;
  /** 命令入口的身份校验：每个请求本地验签，只有接受邀请时向 Auth 确认邮箱（见 `identity.ts`）。 */
  identities: Identities;
  origins: string[];
  publicConfig: { supabaseUrl: string; supabaseKey: string };
}
/**
 * 慢速客户端防护：Node 默认允许 60 秒收完请求头、300 秒收完整个请求，且每 30 秒才检查一次，
 * 少量慢速连接就能长期占住服务。这里收紧为 10 秒 / 60 秒，并把检查间隔降到 5 秒（超时偏差不超过 5 秒）；
 * 超时的连接会收到 408 并被关闭。60 秒对应 2 MiB 请求上限下约 35 KB/s 的最低上行速率，弱网同步仍可完成。
 * headersTimeout 不得大于 requestTimeout，否则 Node 创建服务器时抛错。
 */
const requestLimits = { headersTimeout: 10_000, requestTimeout: 60_000, connectionsCheckingInterval: 5_000 };
/**
 * 协作命令入口：浏览器只能读取公开配置与提交命令。用户身份来自每个请求本地验签的 Supabase access token，
 * 稳态下不访问 Auth；接受邀请时才向 Auth 确认邮箱已验证并与邀请匹配。
 * 返回的服务器已收紧请求头与整个请求的接收时限（10 秒 / 60 秒），调用方直接 listen 即可。
 */
export function collaborationServer(options: ServerOptions) {
  return createServer(requestLimits, (request, response) => {
    void dispatch(request, response, options);
  });
}
/** 把请求目标拆成已解码的路径段；残缺的百分号编码、无法构成 URL 的目标（如 `//`）是客户端错误，不是服务端故障。 */
function pathSegments(target: string | undefined): string[] {
  try {
    return new URL(target ?? '/', 'http://localhost').pathname
      .replace(/^\/collaboration-api/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
  } catch {
    throw new CollaborationError('invalid', '请求格式错误');
  }
}
async function dispatch(request: IncomingMessage, response: ServerResponse, options: ServerOptions): Promise<void> {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const origin = request.headers.origin;
    demand(!origin || options.origins.includes(origin), 'forbidden', '来源未获授权');
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.writeHead(204).end();
      return;
    }
    const path = pathSegments(request.url);
    if (request.method === 'GET' && path.join('/') === 'config') {
      response.end(JSON.stringify(options.publicConfig));
      return;
    }
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    demand(token, 'unauthenticated', '请登录');
    const user = await options.identities.verify(token);
    response.end(JSON.stringify(await route(request, path, token, user, options)));
  } catch (error) {
    const known = error instanceof CollaborationError;
    response.statusCode =
      !known ? 500
      : error.code === 'unauthenticated' ? 401
      : error.code === 'forbidden' ? 403
      : error.code === 'unavailable' ? 503
      : 409;
    response.end(
      JSON.stringify({
        error: known ? error.code : 'internal',
        message: known ? error.message : '服务暂时不可用，请稍后按原请求重试',
        details: known ? error.details : {}
      })
    );
  }
}
/**
 * 唯一的业务接口：`POST /workspaces/:teamId/:appId/commands`。接受邀请前先向 Auth 确认邮箱（以 Auth 的已验证邮箱为准），
 * 其余命令直接使用本地验签得到的身份，成员关系与权限由仓储在命令事务里按成员表裁决。
 */
async function route(request: IncomingMessage, path: string[], token: string, user: Identity, options: ServerOptions) {
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
  demand(request.headers['content-type']?.split(';')[0] === 'application/json', 'invalid', '需要 JSON 请求');
  const command = parseCommand(await body(request));
  if (command.type === 'invite' || command.type === 'accept_invite')
    command.tokenHash = createHash('sha256').update(command.tokenHash).digest('hex');
  const actor = command.type === 'accept_invite' ? await options.identities.confirm(token, user) : user;
  return options.repository.operation(actor, teamId, appId, command);
}
async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += buffer.length;
    demand(length <= 2 * 1024 * 1024, 'limit', '请求不能超过 2 MiB');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new CollaborationError('invalid', 'JSON 格式错误');
  }
}
