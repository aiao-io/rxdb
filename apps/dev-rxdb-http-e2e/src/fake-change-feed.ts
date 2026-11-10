/**
 * 只会说 SSE 的假后端：让「首次连不上」与「接通后掉线再恢复」在 e2e 里按需发生。
 *
 * @remarks
 * 真后端做不到这两件事：离线闸门（`__control/offline`）只掐**新**请求，已经连着的 SSE
 * 一直活着；它的订阅者名册也只在关服时才整体掐断。这里换一台进程内的小服务器，
 * 由用例决定它此刻收不收连接、什么时候把活着的连接掐掉。
 *
 * 它只服务 `GET /v1/changes`。其余请求一律 404，预检照常放行——不放行的话浏览器把它们
 * 当成网络错误，页面会多出一串与本用例无关的离线重试。用到它的用例只看变更通知的徽标与
 * 故障横幅，列表查不到数据与它们无关。
 */

import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 接通时让浏览器隔多久重连（SSE 的 `retry:` 字段，毫秒）。
 *
 * @remarks
 * 浏览器的缺省间隔是 3 秒；接通过一次之后用这个短值，掉线到恢复的那段等待就不必按秒算。
 * 首次连接就失败时浏览器还没收到过它，仍按缺省间隔重连。
 */
const RETRY_MS = 500;

/** 一台假后端。 */
export interface FakeChangeFeed {
  /** 给页面 `?api=` 用的基地址 */
  readonly apiBaseUrl: string;
  /** SSE 端点的绝对地址，与适配器故障说明里写的是同一个 */
  readonly feedUrl: string;
  /**
   * 此后收不收新的 SSE 连接。
   *
   * @param up - `false` 时新连接一律当场掐断 socket，浏览器看到的是网络错误
   */
  accept: (up: boolean) => void;
  /** 掐断此刻活着的全部 SSE 连接 */
  dropAll: () => void;
  /** 关服，连同活着的连接 */
  close: () => Promise<void>;
}

/**
 * 在回环上随机端口起一台假后端。
 *
 * @param up - 起来时收不收 SSE 连接
 * @returns 起好的假后端
 */
export const startFakeChangeFeed = async (up: boolean): Promise<FakeChangeFeed> => {
  let accepting = up;
  const live = new Set<ServerResponse>();

  const server = createServer((request, response) => {
    // 页面与后端不同源；SSE 不带凭据，`*` 就够
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD');
      response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] ?? '');
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'GET' || request.url !== '/v1/changes') {
      response.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"fake change feed only"}');
      return;
    }
    if (!accepting) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    // 与真后端一样先冲一帧：`EventSource` 要收到响应才派发 `open`
    response.write(`retry: ${RETRY_MS}\n:ok\n\n`);
    live.add(response);
    response.on('close', () => live.delete(response));
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

  const dropAll = (): void => {
    for (const response of live) response.destroy();
    live.clear();
  };

  return {
    apiBaseUrl,
    feedUrl: `${apiBaseUrl}/changes`,
    accept: next => {
      accepting = next;
    },
    dropAll,
    close: () =>
      new Promise<void>(resolve => {
        dropAll();
        server.close(() => resolve());
        // SSE 之外还可能挂着页面的 keep-alive 连接，不掐的话 close 要等它们自己超时
        server.closeAllConnections();
      })
  };
};
