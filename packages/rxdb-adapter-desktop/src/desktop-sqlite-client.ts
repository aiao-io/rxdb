/**
 * renderer 侧的桌面 SQLite 客户端，实现 sqlite 核心的 `SqliteClientLike` 契约。
 *
 * @module desktop-sqlite-client
 */

import type {
  SqliteChangeEvent,
  SqliteClientLike,
  SQLiteChangeType,
  SQLiteCompatibleType,
  SqliteResult
} from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterDesktopError } from './desktop-error.js';
import {
  assertDesktopHostResponse,
  parseDesktopHostChangeEvent,
  parseDesktopHostOpenResult,
  type DesktopHostRequest
} from './desktop-host-protocol.js';
import { assertSupportedDesktopStorage, type DesktopSqliteFileStorage } from './desktop-storage.js';

/**
 * renderer 与 host 之间的传输层。
 *
 * @remarks
 * 刻意收得极窄：Electron 下由 preload 通过 `contextBridge` 暴露这两个方法，
 * renderer 因此拿不到原始 `ipcRenderer`，也就无法向任意频道发消息。
 * 换成 `MessagePort` 或 `worker_threads` 时只要满足同样的两个方法即可，客户端无需改动。
 */
export interface DesktopHostTransport {
  /**
   * 发一条请求并等待应答。
   *
   * @param payload - 协议请求
   * @returns host 的未校验应答负载
   */
  request(payload: DesktopHostRequest): Promise<unknown>;
  /**
   * 订阅 host 主动推送的消息。
   *
   * @param listener - 消息回调
   * @returns 取消订阅的函数
   */
  subscribe(listener: (message: unknown) => void): () => void;
}

/** {@link DesktopSqliteClient.connect} 的可选行为参数。 */
export interface DesktopSqliteClientOptions {
  /**
   * 变更事件的防抖窗口（毫秒），省略时用 host 的默认值 `DEFAULT_BATCH_TIMEOUT`。
   *
   * @remarks
   * 与 wasm 客户端的同名选项同义，只是批处理发生在 host 侧——合并在事件跨进程之前完成。
   */
  readonly batchTimeout?: number;
}

/**
 * preload 把传输层挂到 renderer 全局时使用的键。
 *
 * @remarks
 * Electron 下由 `contextBridge.exposeInMainWorld(DESKTOP_HOST_TRANSPORT_KEY, ...)` 注入。
 * 名字带包前缀是为了避免与宿主应用自己的全局撞车。
 */
export const DESKTOP_HOST_TRANSPORT_KEY = '__aiaoRxdbDesktopHost__';

const isDesktopHostTransport = (value: unknown): value is DesktopHostTransport =>
  typeof (value as DesktopHostTransport | undefined)?.request === 'function' &&
  typeof (value as DesktopHostTransport).subscribe === 'function';

/**
 * 读取 preload 注入的传输层。
 *
 * @remarks
 * 只认完整的桥接：只暴露了 `request` 的半成品比完全没暴露更难查，
 * 与其让它带着一个缺方法的对象跑到第一次变更推送时才炸，不如在连接前就拦下来。
 *
 * @returns preload 暴露的传输层
 * @throws {@link RxDBAdapterDesktopError} 未注入或桥接不完整时抛 `host_unavailable`
 */
export function resolveDesktopHostTransport(): DesktopHostTransport {
  const injected = (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];
  if (!isDesktopHostTransport(injected)) {
    throw new RxDBAdapterDesktopError(
      'host_unavailable',
      `no desktop host transport is exposed on globalThis.${DESKTOP_HOST_TRANSPORT_KEY}; ` +
        `the preload script must contextBridge.exposeInMainWorld it before RxDB connects`
    );
  }
  return injected;
}

const isChangeMessage = (message: unknown): message is { sessionId: string; event: unknown } =>
  typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === 'change';

/**
 * 通过桌面 host 访问本地 SQLite 文件的客户端。
 *
 * @remarks
 * 它满足 `SqliteClientLike`，因此 `RxDBAdapterSqliteBase` 里的查询、事务、分支切换、
 * 系统 schema 迁移与 writer lease 全部原样复用——桌面路径不是另一套实现，
 * 只是同一份契约换了条传输通道。
 */
export class DesktopSqliteClient implements SqliteClientLike {
  readonly #transport: DesktopHostTransport;
  readonly #sessionId: string;
  readonly #beginTransactionSql: string;
  readonly #beginSystemMigrationTransactionSql: string;
  readonly #handlers = new Map<SQLiteChangeType, Set<(event: SqliteChangeEvent) => void>>();
  readonly #inFlight = new Set<Promise<unknown>>();
  /** 由 {@link DesktopSqliteClient.connect} 在实例构造完成后立即装上。 */
  #unsubscribe?: () => void;
  #closed = false;

  /** 本客户端在 host 上的会话 ID，用于把推送过来的变更事件对号入座。 */
  get sessionId(): string {
    return this.#sessionId;
  }

  private constructor(
    transport: DesktopHostTransport,
    sessionId: string,
    /** host 解析出的逻辑位置，仅供诊断（AC#5）。 */
    readonly resolvedLocation: string,
    beginTransactionSql: string,
    beginSystemMigrationTransactionSql: string
  ) {
    this.#transport = transport;
    this.#sessionId = sessionId;
    this.#beginTransactionSql = beginTransactionSql;
    this.#beginSystemMigrationTransactionSql = beginSystemMigrationTransactionSql;
  }

  /**
   * 打开一个桌面数据库会话。
   *
   * @param transport - 由 preload 或 worker 桥接提供的传输层
   * @param storage - 桌面存储配置
   * @param options - 可选行为参数
   * @returns 已连接的客户端
   * @throws {@link RxDBAdapterDesktopError} 未注入传输层、配置非法或 host 打开失败时
   */
  static async connect(
    transport: DesktopHostTransport,
    storage: DesktopSqliteFileStorage,
    options?: DesktopSqliteClientOptions
  ): Promise<DesktopSqliteClient> {
    if (!isDesktopHostTransport(transport)) {
      throw new RxDBAdapterDesktopError(
        'host_unavailable',
        'no desktop host transport was injected; the preload script must expose one before RxDB connects'
      );
    }
    // renderer 侧先校验一次，非法配置连 IPC 都不用发；host 侧还会再校验一次。
    assertSupportedDesktopStorage('electron', storage);

    const request = { kind: 'open', storage, batchTimeout: options?.batchTimeout } as const;
    const response = assertDesktopHostResponse('open', await transport.request(request));
    const opened = parseDesktopHostOpenResult(response.result);
    const client = new DesktopSqliteClient(
      transport,
      opened.sessionId,
      opened.resolvedLocation,
      opened.beginTransactionSql,
      opened.beginSystemMigrationTransactionSql
    );
    client.#unsubscribe = transport.subscribe(message => client.#onMessage(message));
    return client;
  }

  /**
   * 在 host 上执行 SQL。
   *
   * @param sql - 待执行的 SQL
   * @param bindings - 位置绑定参数
   * @returns 与本地 SQLite 后端形状一致的执行结果
   * @throws {@link RxDBAdapterDesktopError} 会话已断开，或 host 报告执行失败时
   */
  async execute(sql: string, bindings: SQLiteCompatibleType[] = []): Promise<SqliteResult> {
    this.#assertOpen();
    const pending = this.#transport.request({ kind: 'execute', sessionId: this.#sessionId, sql, bindings });
    this.#inFlight.add(pending);
    try {
      return assertDesktopHostResponse('execute', await pending).result;
    } finally {
      this.#inFlight.delete(pending);
    }
  }

  /**
   * 报告 host 侧 SQLite 引擎的版本。
   *
   * @returns 形如 `3.50.4` 的版本串
   */
  async version(): Promise<string> {
    this.#assertOpen();
    const request = this.#transport.request({ kind: 'version', sessionId: this.#sessionId });
    return assertDesktopHostResponse('version', await request).result;
  }

  /**
   * 注册变更事件监听。
   *
   * @remarks
   * 返回 Promise 是为了对齐 `SqliteClientLike`：Comlink 远端客户端即便实现是同步的也会返回
   * Promise，注册方一律 `await`，否则监听可能尚未生效就开始写库。
   *
   * @param type - 关心的变更类型
   * @param handler - 事件回调
   */
  addEventListener(type: SQLiteChangeType, handler: (event: SqliteChangeEvent) => void): Promise<void> {
    this.#assertOpen();
    const handlers = this.#handlers.get(type) ?? new Set();
    handlers.add(handler);
    this.#handlers.set(type, handlers);
    return Promise.resolve();
  }

  /**
   * 开启普通事务的 SQL。
   *
   * @returns host 在 `open` 应答里给出的语句
   */
  beginTransactionSql(): string {
    return this.#beginTransactionSql;
  }

  /**
   * 系统 schema 迁移使用的最强锁 SQL。
   *
   * @returns host 在 `open` 应答里给出的语句
   */
  beginSystemMigrationTransactionSql(): string {
    return this.#beginSystemMigrationTransactionSql;
  }

  /**
   * 断开会话。
   *
   * @remarks
   * 顺序即 AC#9 的语义：先置关闭标记**停止接受新任务**，再等在途请求跑完，
   * 最后才让 host 释放句柄。等待用 `allSettled`——某条在途查询失败不该把句柄一直挂住。
   *
   * 重复调用是安全的。
   */
  async disconnect(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#inFlight]);
    this.#unsubscribe?.();
    this.#handlers.clear();
    assertDesktopHostResponse('close', await this.#transport.request({ kind: 'close', sessionId: this.#sessionId }));
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new RxDBAdapterDesktopError('session_closed', `desktop session ${this.#sessionId} is already disconnected`);
    }
  }

  #onMessage(message: unknown): void {
    if (this.#closed || !isChangeMessage(message) || message.sessionId !== this.#sessionId) return;
    const event = parseDesktopHostChangeEvent(message.event);
    const handlers = this.#handlers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) handler(event);
  }
}
