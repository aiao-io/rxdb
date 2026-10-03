import { STALE_ENDPOINT_HINT } from './devtools-endpoint.js';

interface CdpResponse {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

type CdpListener = (method: string, params: unknown) => void;

/**
 * 单条命令的上限。开发者工具不会对挂起的命令报错：模拟器调试器停在断点上时 `Runtime.evaluate` 永远不回，
 * 不设上限整个 `beforeAll` 只会无声超时（2026-10-03 实测）。
 */
const COMMAND_TIMEOUT_MS = 30_000;

/**
 * 极简 CDP 客户端：一条 browser websocket 上用 flatten 会话驱动各个 target。
 *
 * 不用 Playwright 的 `connectOverCDP`：模拟器是 `webview` target，Playwright 不把它当 page 暴露，
 * 它的 `CDPSession` 也带不了 flatten 的 `sessionId`。
 */
export class CdpConnection {
  #nextId = 0;
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly #listeners = new Set<CdpListener>();

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener('message', event => this.#dispatch(JSON.parse(String(event.data)) as CdpResponse));
  }

  /** 连上 browser 端点；连不上时给出「IDE 没开或端口残留」的提示。 */
  static async open(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`${endpoint}\n  ${STALE_ENDPOINT_HINT}`)), {
        once: true
      });
    });
    return new CdpConnection(socket);
  }

  /** 发一条命令；`sessionId` 给 flatten 会话里的 target。{@link COMMAND_TIMEOUT_MS} 内没回就 reject。 */
  send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = ++this.#nextId;
    this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new Error(`${method} ${COMMAND_TIMEOUT_MS}ms 没有回应：模拟器调试器是不是停在断点上，或者 IDE 正被占用`)
        );
      }, COMMAND_TIMEOUT_MS);
      const settle = () => clearTimeout(timer);
      this.#pending.set(id, {
        resolve: value => {
          settle();
          resolve(value as T);
        },
        reject: error => {
          settle();
          reject(error);
        }
      });
    });
  }

  /** 订阅事件，返回取消函数。 */
  on(listener: CdpListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** 断开连接，不影响开发者工具本身。 */
  close(): void {
    this.#socket.close();
  }

  #dispatch(message: CdpResponse): void {
    const waiting = message.id === undefined ? undefined : this.#pending.get(message.id);
    if (waiting && message.id !== undefined) {
      this.#pending.delete(message.id);
      if (message.error === undefined) waiting.resolve(message.result);
      else waiting.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    if (message.method) for (const listener of this.#listeners) listener(message.method, message.params);
  }
}
