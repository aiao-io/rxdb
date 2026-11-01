/** 同一条字节通道上的双向块请求会话；不感知清单同步协议。 */
import type { P2PFileManifest } from './chunking.js';
import { asError } from './errors.js';
import { enqueueAbortable, type Deferred } from './frame-queue.js';
import { decodeP2PFrame, encodeP2PFrame, type P2PByteTransport, type P2PFrame } from './frame.js';
import { MAX_OUTSTANDING_REQUESTS, MAX_P2P_BUFFERED_CHUNKS } from './limits.js';
import { createChunkRequestHandler, type P2PChunkRequest, type P2PChunkSource } from './transfer.js';

type RequestFrame = Extract<P2PFrame, { kind: 'request' }>;

/** 同一条通道上的双向请求/响应会话。 */
export interface P2PTransportPeer {
  /** 向对端请求块的来源，交给 `transferP2PFile`。 */
  readonly source: P2PChunkSource;
  /** 会话结束（本端关闭、对端断开或违反协议）时兑现结束原因；从不拒绝。 */
  readonly closed: Promise<Error>;
  /** 结束会话并关闭底层传输。 */
  readonly close: () => Promise<void>;
}

/** 收到块请求时传给认证钩子的上下文。 */
export interface P2PRequestContext {
  /** 对端分配的请求号。 */
  readonly requestId: string;
  /** 请求的内容哈希。 */
  readonly contentHash: string;
  /** 字节区间起点。 */
  readonly offset: number;
  /** 字节区间长度。 */
  readonly size: number;
  /** 会话结束时中止。 */
  readonly signal: AbortSignal;
  /** 信令/握手层绑定的认证上下文。 */
  readonly authenticatedContext?: unknown;
}

/** 对端传输会话的认证与资源限制。 */
export interface P2PTransportPeerOptions {
  /** 在读取本地字节前校验会话身份；抛错会拒绝请求且不读取文件。不提供时本端不供块。 */
  readonly authorizeRequest?: (request: P2PRequestContext) => Promise<void> | void;
  /** 由信令/握手层绑定的认证上下文，不会从帧内容推断身份。 */
  readonly authenticatedContext?: unknown;
  /**
   * 同时读盘并发送的入站请求数，1～32，默认 8；响应发不出去时名额一直占着，慢接收端不会让发送缓冲膨胀。
   * 超出的请求排队，对端未完成请求超过 32 个即视为违反协议并结束会话。
   */
  readonly maxInboundRequests?: number;
}

/** 本端发出请求的名额：与对端执行的协议上限一致，超出时排队等候。 */
class RequestSlots {
  readonly #waiters: Array<Deferred<void>> = [];
  #available = MAX_OUTSTANDING_REQUESTS;
  #failure: Error | undefined;

  acquire(signal: AbortSignal): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    if (this.#available > 0) {
      this.#available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => enqueueAbortable(this.#waiters, { resolve, reject }, signal));
  }

  release(): void {
    const next = this.#waiters.shift();
    if (next) next.resolve();
    else this.#available += 1;
  }

  fail(error: Error): void {
    this.#failure = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }
}

/** 一条连接上的会话：唯一的接收泵分发响应与请求，入站请求按名额并发处理。 */
class TransportSession {
  readonly #transport: P2PByteTransport;
  readonly #serve: (request: P2PChunkRequest, signal: AbortSignal) => Promise<Uint8Array>;
  readonly #options: P2PTransportPeerOptions;
  readonly #maxInbound: number;
  readonly #outgoing = new Map<string, Deferred<Uint8Array>>();
  readonly #slots = new RequestSlots();
  readonly #inboundQueue: RequestFrame[] = [];
  readonly #inboundControllers = new Set<AbortController>();
  #resolveClosed!: (reason: Error) => void;
  #closing: Promise<void> = Promise.resolve();
  #stopped = false;
  #activeInbound = 0;
  #sequence = 0;
  readonly closed: Promise<Error>;

  constructor(
    transport: P2PByteTransport,
    serve: (request: P2PChunkRequest, signal: AbortSignal) => Promise<Uint8Array>,
    options: P2PTransportPeerOptions
  ) {
    const maxInbound = options.maxInboundRequests ?? MAX_P2P_BUFFERED_CHUNKS;
    if (!Number.isSafeInteger(maxInbound) || maxInbound < 1 || maxInbound > MAX_OUTSTANDING_REQUESTS)
      throw new RangeError(`maxInboundRequests must be an integer between 1 and ${MAX_OUTSTANDING_REQUESTS}`);
    this.#transport = transport;
    this.#serve = serve;
    this.#options = options;
    this.#maxInbound = maxInbound;
    this.closed = new Promise<Error>(resolve => (this.#resolveClosed = resolve));
    void this.#pump();
  }

  async request(request: P2PChunkRequest, signal: AbortSignal): Promise<Uint8Array> {
    if (this.#stopped) throw new Error('P2P transport peer is closed');
    signal.throwIfAborted();
    await this.#slots.acquire(signal);
    const requestId = String(this.#sequence++);
    try {
      if (this.#stopped) throw new Error('P2P transport peer is closed');
      signal.throwIfAborted();
      const response = this.#awaitResponse(requestId, signal);
      const { contentHash, offset, size } = request;
      const sent = this.#transport.send(encodeP2PFrame({ kind: 'request', requestId, contentHash, offset, size }));
      const sentThenResponse = sent.then(
        () => response,
        (error: unknown) => {
          this.#shutdown(asError(error));
          throw error;
        }
      );
      return await Promise.race([sentThenResponse, response]);
    } finally {
      this.#outgoing.delete(requestId);
      this.#slots.release();
    }
  }

  close(): Promise<void> {
    this.#shutdown(new Error('P2P transport peer closed'));
    return this.#closing;
  }

  #awaitResponse(requestId: string, signal: AbortSignal): Promise<Uint8Array> {
    const response = new Promise<Uint8Array>((resolve, reject) => {
      const abort = (): void => reject(signal.reason);
      const settled =
        <T>(settle: (value: T) => void) =>
        (value: T): void => {
          signal.removeEventListener('abort', abort);
          settle(value);
        };
      this.#outgoing.set(requestId, { resolve: settled(resolve), reject: settled(reject) });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    response.catch(() => undefined);
    return response;
  }

  async #pump(): Promise<void> {
    try {
      while (!this.#stopped) this.#dispatch(decodeP2PFrame(await this.#transport.receive()));
    } catch (error) {
      this.#shutdown(asError(error));
    }
  }

  #dispatch(frame: P2PFrame): void {
    if (frame.kind === 'request') return this.#enqueueInbound(frame);
    const waiter = this.#outgoing.get(frame.requestId);
    if (!waiter) return;
    this.#outgoing.delete(frame.requestId);
    if (frame.ok) waiter.resolve(frame.payload);
    else waiter.reject(new Error(frame.error));
  }

  #enqueueInbound(frame: RequestFrame): void {
    if (this.#inboundQueue.length + this.#activeInbound >= MAX_OUTSTANDING_REQUESTS) {
      this.#shutdown(new RangeError('peer exceeded the outstanding request limit'));
      return;
    }
    this.#inboundQueue.push(frame);
    this.#drainInbound();
  }

  #drainInbound(): void {
    while (!this.#stopped && this.#activeInbound < this.#maxInbound && this.#inboundQueue.length > 0) {
      const frame = this.#inboundQueue.shift() as RequestFrame;
      this.#activeInbound += 1;
      void this.#serveRequest(frame).finally(() => {
        this.#activeInbound -= 1;
        this.#drainInbound();
      });
    }
  }

  async #serveRequest(frame: RequestFrame): Promise<void> {
    const controller = new AbortController();
    this.#inboundControllers.add(controller);
    try {
      const payload = await this.#readAuthorized(frame, controller.signal);
      await this.#send({ kind: 'response', requestId: frame.requestId, ok: true, payload });
    } catch (error) {
      await this.#send({ kind: 'response', requestId: frame.requestId, ok: false, error: asError(error).message });
    } finally {
      this.#inboundControllers.delete(controller);
    }
  }

  async #readAuthorized(frame: RequestFrame, signal: AbortSignal): Promise<Uint8Array> {
    const authorize = this.#options.authorizeRequest;
    if (!authorize) throw new Error('peer authorization is required before serving chunks');
    const request = { contentHash: frame.contentHash, offset: frame.offset, size: frame.size };
    await authorize({
      requestId: frame.requestId,
      ...request,
      signal,
      authenticatedContext: this.#options.authenticatedContext
    });
    return this.#serve(request, signal);
  }

  async #send(frame: P2PFrame): Promise<void> {
    if (this.#stopped) return;
    try {
      await this.#transport.send(encodeP2PFrame(frame));
    } catch (error) {
      this.#shutdown(asError(error));
    }
  }

  #shutdown(reason: Error): void {
    if (this.#stopped) return;
    this.#stopped = true;
    for (const controller of this.#inboundControllers) controller.abort(reason);
    this.#inboundControllers.clear();
    this.#inboundQueue.length = 0;
    for (const waiter of this.#outgoing.values()) waiter.reject(reason);
    this.#outgoing.clear();
    this.#slots.fail(reason);
    this.#resolveClosed(reason);
    this.#closing = (async () => this.#transport.close())();
    this.#closing.catch(() => undefined);
  }
}

/**
 * 将帧传输适配成可供 `transferP2PFile` 使用的块来源，并同时响应对端请求。
 *
 * @remarks
 * 只有一个后台泵消费 `receive()`，多源并行请求不会互相吞帧。请求按请求方清单的字节区间取数，
 * 本端用 `readRange` 读本地文件的任意区间，因此块大小不同的持有者也能互相供块。
 * 收到畸形帧、底层收发失败或对端违反协议时结束会话并关闭底层传输，原因经 `closed` 报告。
 *
 * @param id - 对端标识，作为块来源的 `id`
 * @param readRange - 读本地文件的字节区间
 * @throws RangeError `maxInboundRequests` 越界
 */
export function createP2PTransportPeer(
  transport: P2PByteTransport,
  id: string,
  manifest: P2PFileManifest,
  readRange: (offset: number, size: number) => Promise<Uint8Array>,
  options: P2PTransportPeerOptions
): P2PTransportPeer {
  const session = new TransportSession(transport, createChunkRequestHandler(manifest, readRange), options);
  return {
    source: { id, requestChunk: (request, signal) => session.request(request, signal) },
    closed: session.closed,
    close: () => session.close()
  };
}
