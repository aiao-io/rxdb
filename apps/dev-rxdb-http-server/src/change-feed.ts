/**
 * 变更通知端点——**协议的一部分**（`http-protocol.md`「变更通知（可选）」）。
 *
 * @remarks
 * 这个文件里的每一行都对着协议里的一句话：响应头、帧格式、载荷字段。照着 demo 抄的人
 * 抄的是这半边；「连接记在哪」在 `change-subscribers.ts`，那半边不必照抄。
 *
 * **载荷只有实体名和 `clientId`，永远不带行数据**（US-023 D8）。三条理由：
 *
 * 1. 广播是发给**所有**订阅者的，而「这一行该不该给这个人看」只有查询路径答得出来——
 *    往通知里塞行，等于把行级权限绕过去。
 * 2. 客户端的本地行只有 `#pull → upsertMany` 一条写入路径，多一条就多一种不一致。
 * 3. 一条通知本来就答不出「这一行落不落在你的 `where` 里」，塞了行也还得回查。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ChangeSubscribers } from './change-subscribers.ts';
import { CLIENT_ID_HEADER } from './config.ts';

/** 注释帧的心跳间隔。SSE 的注释以 `:` 开头，客户端会忽略，作用只是让沉默的连接别被中间层收走。 */
const KEEP_ALIVE_INTERVAL_MS = 20_000;

/**
 * 订阅：把这条响应变成一条不结束的 SSE 流。
 *
 * @remarks
 * `Cache-Control: no-cache` 与 `X-Accel-Buffering: no` 都是**必需**的：
 * 前者挡住浏览器与中间缓存，后者挡住 nginx 一类反代的响应缓冲——被缓冲的 SSE
 * 表现为「连上了但一条也不来」，比连不上更难查。
 *
 * 跨源头已经由 `dispatch()` 统一加过了（协议要求错误响应也带，见 `cors.ts`）。
 */
export const openChangeFeed = (
  request: IncomingMessage,
  response: ServerResponse,
  subscribers: ChangeSubscribers
): void => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  // 先冲一个注释帧：`EventSource` 要收到响应头才派发 `open`，而某些栈在第一次
  // 写入之前不会真的把头发出去。客户端的「连接成功 = 全量失效」（D7）等的就是这个 open。
  response.write(':ok\n\n');
  response.flushHeaders();

  const keepAlive = setInterval(() => {
    if (!response.writableEnded) response.write(':keep-alive\n\n');
  }, KEEP_ALIVE_INTERVAL_MS);
  // 不 unref，进程就会被这个定时器吊着不退出——demo 的 `Ctrl+C` 会看起来像卡死
  keepAlive.unref();
  request.on('close', () => clearInterval(keepAlive));

  subscribers.add(response);
};

/**
 * 广播一条「某实体变了」。
 *
 * @param entity - **客户端**实体名（`@Entity({ name })`），不是资源路径
 * @param clientId - 发起这次写入的客户端标识；`undefined` 时字段不出现在载荷里
 *
 * @remarks
 * `clientId` 原样回显，后端不解释也不校验它。客户端拿它抑制自己的回声（D6）——
 * 刚写完的那一端本地已经是最新，再被自己的通知踢一次纯属白跑一趟远端。
 */
export const broadcastChange = (subscribers: ChangeSubscribers, entity: string, clientId?: string): void => {
  subscribers.broadcast(`data:${JSON.stringify({ entity, ...(clientId === undefined ? {} : { clientId }) })}\n\n`);
};

/** 从一次写入请求里读出发起方标识。缺失、空串、重复头一律当没有。 */
export const readClientId = (request: IncomingMessage): string | undefined => {
  const header = request.headers[CLIENT_ID_HEADER];
  return typeof header === 'string' && header !== '' ? header : undefined;
};
