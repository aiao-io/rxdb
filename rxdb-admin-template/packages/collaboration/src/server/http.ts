import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { CollaborationError } from '../model.js';
import { commandHandler, errorResponse, type CommandHandler, type HandlerOptions } from './handler.js';

export type { RepositoryApi } from './handler.js';

/**
 * 慢速客户端防护：Node 默认允许 60 秒收完请求头、300 秒收完整个请求，且每 30 秒才检查一次，
 * 少量慢速连接就能长期占住服务。这里收紧为 10 秒 / 120 秒，并把检查间隔降到 5 秒（超时偏差不超过 5 秒）；
 * 超时的连接会收到 408 并被关闭。120 秒对应 4 MiB 请求上限下约 35 KB/s 的最低上行速率，弱网同步仍可完成。
 * headersTimeout 不得大于 requestTimeout，否则 Node 创建服务器时抛错。
 */
const requestLimits = { headersTimeout: 10_000, requestTimeout: 120_000, connectionsCheckingInterval: 5_000 };
/** Node 的 fetch 要求以流作请求体时声明半双工。 */
type StreamingInit = RequestInit & { duplex: 'half' };

/**
 * 协作命令入口的 Node 服务器：业务逻辑全部在 fetch 风格的处理函数里（`handler.ts`，与 Edge Function 共用），
 * 这里只做 node:http 与 Request / Response 之间的转换。返回的服务器已收紧请求头与整个请求的接收时限（10 秒 / 60 秒），
 * 调用方直接 listen 即可。
 */
export function collaborationServer(options: HandlerOptions) {
  return nodeServer(commandHandler(options));
}

/** 把一个 fetch 风格的处理函数挂到 node:http 服务器上（同样的请求时限）。 */
export function nodeServer(handle: CommandHandler) {
  return createServer(requestLimits, (request, response) => {
    void serve(handle, request, response);
  });
}

/** node:http 的请求转为 fetch 的 Request；请求目标连 URL 都构不成（如 `//`）时按请求格式错误拒绝。 */
function toRequest(request: IncomingMessage): Request {
  let url: URL;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
  } catch {
    throw new CollaborationError('invalid', '请求格式错误');
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers))
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const method = request.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers });
  const init: StreamingInit = { method, headers, body: Readable.toWeb(request) as ReadableStream, duplex: 'half' };
  return new Request(url, init);
}

async function serve(handle: CommandHandler, request: IncomingMessage, response: ServerResponse): Promise<void> {
  let reply: Response;
  try {
    reply = await handle(toRequest(request));
  } catch (error) {
    reply = errorResponse(error);
  }
  response.writeHead(reply.status, Object.fromEntries(reply.headers.entries()));
  response.end(Buffer.from(await reply.arrayBuffer()));
}
