/**
 * Worker 用到的 workerd 接口的最小声明。
 *
 * @remarks
 * 不引 `@cloudflare/workers-types`：它以全局声明替换 DOM 库，和本项目前端共用的 `lib: dom` 冲突。
 * 这里只声明实际调用的那几个成员，签名取自 Cloudflare 文档（Durable Object 休眠 WebSocket、R2、绑定）。
 */

/** 带休眠附件的 WebSocket（workerd 扩展）。 */
export interface HibernatableWebSocket extends WebSocket {
  /** 把可结构化克隆的值挂到连接上，休眠唤醒后仍可读回。 */
  serializeAttachment(value: unknown): void;
  /** 读回 {@link HibernatableWebSocket.serializeAttachment} 写入的值；未写入时为 null。 */
  deserializeAttachment(): unknown;
}

/** Durable Object 的状态句柄。 */
export interface DurableObjectStateLike {
  /** 以休眠 API 接管服务端这一半 WebSocket。 */
  acceptWebSocket(socket: WebSocket): void;
  /** 当前接管的全部 WebSocket。 */
  getWebSockets(): HibernatableWebSocket[];
}

/** Durable Object 绑定。 */
export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/** R2 对象（带正文）。 */
export interface R2ObjectBodyLike {
  readonly body: ReadableStream<Uint8Array>;
  readonly size: number;
}

/** R2 bucket 绑定。 */
export interface R2BucketLike {
  head(key: string): Promise<{ readonly size: number } | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  /** `sha256` 为 hex 时由 R2 校验上传内容，不符即拒绝写入。 */
  put(key: string, value: ReadableStream<Uint8Array>, options: { readonly sha256: string }): Promise<unknown>;
}

/** workerd 全局的 WebSocketPair：`[0]` 交给客户端，`[1]` 留在服务端。 */
export const createWebSocketPair = (): readonly [WebSocket, WebSocket] => {
  const Pair = (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, WebSocket> }).WebSocketPair;
  const pair = new Pair();
  return [pair[0], pair[1]];
};

/** 101 升级响应：`webSocket` 是 workerd 对 `ResponseInit` 的扩展。 */
export const upgradeResponse = (client: WebSocket): Response =>
  new Response(null, { status: 101, webSocket: client } as ResponseInit);
