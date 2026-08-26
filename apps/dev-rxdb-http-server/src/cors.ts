/**
 * 跨源响应头与预检处理。
 *
 * @remarks
 * `http-protocol.md` 的「通用约定」列了 URL、`Content-Type`、认证 header、时间戳、
 * `encodeURIComponent` 五条，**没有一条提到跨源**——因为协议本身与传输无关。
 * 但真实浏览器前端几乎不可能与 API 同源，于是这份参考实现把跨源当成默认场景：
 * 前端 4300、后端 4301，**故意不同源**。
 *
 * 三个必须出现在 `Access-Control-Allow-Headers` 里的头（AC#9）：
 *
 * | header          | 为什么不在 CORS 安全列表里                                  |
 * | :-------------- | :---------------------------------------------------------- |
 * | `content-type`  | 安全列表只放行三种 MIME，`application/json` 不在其中        |
 * | `authorization` | 从来不是安全列表请求头                                      |
 * | `if-none-match` | 条件请求头，同样不在安全列表                                |
 *
 * 少任何一个，对应端点就在预检阶段被浏览器挡下，请求根本发不出去。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_METHODS = 'GET, HEAD, POST, PATCH, OPTIONS';

const ALLOWED_HEADERS = 'content-type, authorization, if-none-match';

/**
 * 预检缓存时长，刻意设为 0。
 *
 * @remarks
 * 非零值会让浏览器把预检结果缓存起来，于是「第二次请求还会不会预检」变成一个
 * 取决于计时的问题——e2e 断言就不再稳定。demo 要的是可观测，不是少一个来回。
 */
const MAX_AGE = '0';

/** 允许的来源。回显 `Origin` 而不是写死 `*`：真实后端就是这么做的，也方便看清是谁在请求。 */
const resolveAllowOrigin = (request: IncomingMessage): string => {
  const origin = request.headers.origin;
  return typeof origin === 'string' && origin !== '' ? origin : '*';
};

/**
 * 给**每一个**响应（含错误响应）加上跨源头。
 *
 * @param exposeEtag - 是否附 `Access-Control-Expose-Headers: ETag`。
 *   关掉时复现 AC#10 那条已知症状：跨源脚本读不到 `ETag`，条件请求静默失效。
 *
 * @remarks
 * 错误响应也要加——少了跨源头的 `409` 在浏览器里会退化成 network error，
 * 客户端于是抛 `NetworkOfflineError` 并**降级到本地缓存**，把 AC#13 那条
 * 「后端回 409 时不降级」的对照实验做成一个假绿。
 */
export const applyCorsHeaders = (request: IncomingMessage, response: ServerResponse, exposeEtag: boolean): void => {
  response.setHeader('Access-Control-Allow-Origin', resolveAllowOrigin(request));
  response.setHeader('Vary', 'Origin');
  if (exposeEtag) {
    // 没有这一行，浏览器把 ETag 从 Response 上抹掉，前端只能读到 null——见 AC#10。
    response.setHeader('Access-Control-Expose-Headers', 'ETag');
  }
};

/**
 * 处理 `OPTIONS` 预检。
 *
 * @returns 是否已经把响应写完（`true` 表示调用方不要再往下路由）。
 *
 * @remarks
 * 回 `204` 而不是 `200`：预检响应本就没有 body，`200` + 空 body 会让部分中间层
 * 补一个 `Content-Length: 0` 之外的东西进来。
 */
export const handlePreflight = (request: IncomingMessage, response: ServerResponse, exposeEtag: boolean): boolean => {
  if (request.method !== 'OPTIONS') return false;

  applyCorsHeaders(request, response, exposeEtag);
  response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  response.setHeader('Access-Control-Max-Age', MAX_AGE);
  response.writeHead(204);
  response.end();
  return true;
};
