/**
 * 订阅者名册——**非协议**的 demo 设施。
 *
 * @remarks
 * 与 `__control` 同一个性质：协议只规定「SSE 端点推什么」（见 `change-feed.ts`），
 * 至于「活着的连接记在哪、进程退出时怎么收场」，那是每个后端自己的事——
 * 真实部署里这一层通常是 Redis pub/sub 或消息队列，而不是一个进程内的 `Set`。
 * 两者分开放，是为了让照着 demo 抄协议的人一眼看得出哪半边必须照抄、哪半边不必。
 *
 * 这里唯一不显然的是**关服**：`server.close()` 只等已有连接自然结束，而 SSE 连接
 * 按定义永远不会自然结束。名册不主动把它们掐掉，`Ctrl+C` 就会挂住，只能 `kill -9`。
 */

import type { ServerResponse } from 'node:http';

/** 活着的 SSE 连接名册。 */
export interface ChangeSubscribers {
  /** 登记一条连接，并在它断开时自动注销 */
  add: (response: ServerResponse) => void;
  /** 当前活着的连接数（诊断用） */
  size: () => number;
  /** 逐个写一行文本给所有订阅者 */
  broadcast: (frame: string) => void;
  /** 掐掉全部连接。关服前必须调用，否则 `server.close()` 永不返回 */
  closeAll: () => void;
}

/** 建一份空名册。 */
export const createChangeSubscribers = (): ChangeSubscribers => {
  const responses = new Set<ServerResponse>();

  const add = (response: ServerResponse): void => {
    responses.add(response);
    // 浏览器关标签页、EventSource.close()、网络断——都只表现为 socket 关闭，
    // 没有任何应用层的「退订」消息。不在这里注销，名册就会随着刷新页面单调增长。
    response.on('close', () => {
      responses.delete(response);
    });
  };

  const broadcast = (frame: string): void => {
    for (const response of responses) {
      // 对端刚断而 'close' 还没派发时写入会抛；一个坏连接不该让其余订阅者收不到
      if (!response.writableEnded) response.write(frame);
    }
  };

  const closeAll = (): void => {
    for (const response of responses) response.end();
    responses.clear();
  };

  return { add, size: (): number => responses.size, broadcast, closeAll };
};
