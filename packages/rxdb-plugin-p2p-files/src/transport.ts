/** 传输层只承载已编码的帧，不感知清单和同步协议。 */
import type { P2PFileManifest } from './chunking.js';
import { createChunkRequestHandler, type P2PChunkSource } from './transfer.js';
export interface P2PByteTransport {
  readonly send: (frame: Uint8Array) => Promise<void>;
  readonly receive: (signal?: AbortSignal) => Promise<Uint8Array>;
  readonly close: () => void | Promise<void>;
}

/** 块协议帧的 JSON 元数据与二进制负载。 */
export type P2PFrame =
  | { readonly kind: 'request'; readonly requestId: string; readonly contentHash: string; readonly index: number }
  | { readonly kind: 'response'; readonly requestId: string; readonly ok: true; readonly payload: Uint8Array }
  | { readonly kind: 'response'; readonly requestId: string; readonly ok: false; readonly error: string };

const frameEncoder = new TextEncoder();
const frameDecoder = new TextDecoder();

/** 同一条通道上的双向请求/响应会话。 */
export interface P2PTransportPeer {
  readonly source: P2PChunkSource;
  readonly close: () => Promise<void>;
}

/** 收到块请求时传给认证钩子的上下文。 */
export interface P2PRequestContext {
  readonly requestId: string;
  readonly contentHash: string;
  readonly index: number;
  readonly signal: AbortSignal;
  readonly authenticatedContext?: unknown;
}

/** 对端传输会话的认证与资源限制。 */
export interface P2PTransportPeerOptions {
  /** 在读取本地块前校验会话身份；抛错会拒绝请求且不读取文件。 */
  readonly authorizeRequest?: (request: P2PRequestContext) => Promise<void> | void;
  /** 由信令/握手层绑定的认证上下文，不会从帧内容推断身份。 */
  readonly authenticatedContext?: unknown;
  /** 单条连接同时处理的入站块请求上限。 */
  readonly maxInboundRequests?: number;
}

/**
 * 将帧传输适配成可供 `transferP2PFile` 使用的块 source，并同时响应对端请求。
 *
 * 只有一个后台 pump 消费 `receive()`，因此多源并行请求不会互相吞帧。
 */
export function createP2PTransportPeer(
  transport: P2PByteTransport,
  id: string,
  manifest: P2PFileManifest,
  readChunk: (index: number) => Promise<Uint8Array>,
  options: P2PTransportPeerOptions
): P2PTransportPeer {
  const pending = new Map<
    string,
    {
      readonly resolve: (bytes: Uint8Array) => void;
      readonly reject: (error: unknown) => void;
      readonly cleanup: () => void;
    }
  >();
  const handler = createChunkRequestHandler(manifest, readChunk);
  const maxInboundRequests = Math.max(1, Math.floor(options.maxInboundRequests ?? 16));
  let sequence = 0;
  let stopped = false;
  let inboundRequests = 0;
  let pumpPromise: Promise<void> | undefined;
  const stop = (error: unknown): void => {
    if (stopped) return;
    stopped = true;
    for (const waiter of pending.values()) {
      waiter.cleanup();
      waiter.reject(error);
    }
    pending.clear();
  };
  const sendResponse = async (frame: P2PFrame): Promise<void> => {
    try {
      await transport.send(encodeP2PFrame(frame));
    } catch (error) {
      stop(error);
      await Promise.resolve(transport.close()).catch(() => undefined);
    }
  };
  const handleRequest = async (frame: Extract<P2PFrame, { kind: 'request' }>): Promise<void> => {
    if (inboundRequests >= maxInboundRequests) {
      await sendResponse({
        kind: 'response',
        requestId: frame.requestId,
        ok: false,
        error: 'too many inbound requests'
      });
      return;
    }
    inboundRequests += 1;
    const controller = new AbortController();
    try {
      await options.authorizeRequest({
        requestId: frame.requestId,
        contentHash: frame.contentHash,
        index: frame.index,
        signal: controller.signal,
        authenticatedContext: options.authenticatedContext
      });
      const payload = await handler(frame.contentHash, frame.index);
      await sendResponse({ kind: 'response', requestId: frame.requestId, ok: true, payload });
    } catch (error) {
      await sendResponse({
        kind: 'response',
        requestId: frame.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      inboundRequests -= 1;
    }
  };
  const pump = async (): Promise<void> => {
    try {
      while (!stopped) {
        const frame = decodeP2PFrame(await transport.receive());
        if (frame.kind === 'response') {
          const waiter = pending.get(frame.requestId);
          if (!waiter) continue;
          pending.delete(frame.requestId);
          waiter.cleanup();
          if (frame.ok) waiter.resolve(frame.payload);
          else waiter.reject(new Error(frame.error));
          continue;
        }
        void handleRequest(frame);
      }
    } catch (error) {
      stop(error);
    }
  };
  const ensurePump = (): void => {
    pumpPromise ??= pump();
  };
  const source: P2PChunkSource = {
    id,
    requestChunk: async (contentHash, index, signal) => {
      ensurePump();
      if (stopped) throw new Error('P2P transport peer is closed');
      const requestId = `${id}:${sequence++}`;
      if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      let rejectRequest: (error: unknown) => void = () => undefined;
      let abort = (): void => undefined;
      const cleanup = (): void => signal?.removeEventListener('abort', abort);
      const result = new Promise<Uint8Array>((resolve, reject) => {
        rejectRequest = reject;
        pending.set(requestId, { resolve, reject, cleanup });
      });
      abort = (): void => {
        if (pending.delete(requestId)) {
          cleanup();
          rejectRequest(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        await transport.send(encodeP2PFrame({ kind: 'request', requestId, contentHash, index }));
        return await result;
      } catch (error) {
        const waiter = pending.get(requestId);
        if (waiter) {
          pending.delete(requestId);
          waiter.cleanup();
        }
        throw error;
      } finally {
        cleanup();
      }
    }
  };
  ensurePump();
  return {
    source,
    async close() {
      const error = new Error('P2P transport peer closed');
      stop(error);
      await transport.close();
      // 底层 receive 可能在 close() 与下一轮 pump 之间登记 waiter；底层实现会
      // 在关闭时唤醒它。这里不等待 pump，避免关闭竞态把调用方永久挂起。
    }
  };
}

/** 编码一帧，供 WebRTC 和 TCP 适配器共用。 */
export const encodeP2PFrame = (frame: P2PFrame): Uint8Array => {
  const payload = frame.kind === 'response' && frame.ok ? frame.payload : undefined;
  const metadata =
    frame.kind === 'response' && frame.ok ?
      { ...frame, payload: undefined, payloadLength: payload?.byteLength ?? 0 }
    : frame;
  const metadataBytes = frameEncoder.encode(JSON.stringify(metadata));
  const result = new Uint8Array(4 + metadataBytes.byteLength + (payload?.byteLength ?? 0));
  new DataView(result.buffer).setUint32(0, metadataBytes.byteLength);
  result.set(metadataBytes, 4);
  if (payload) result.set(payload, 4 + metadataBytes.byteLength);
  return result;
};

/** 解码并严格校验一帧，截断或未知类型均以 RangeError 暴露。 */
export const decodeP2PFrame = (bytes: Uint8Array): P2PFrame => {
  if (bytes.byteLength < 4) throw new RangeError('P2P frame is truncated');
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (metadataLength === 0 || metadataLength > bytes.byteLength - 4)
    throw new RangeError('P2P frame metadata is truncated');
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(frameDecoder.decode(bytes.slice(4, 4 + metadataLength))) as Record<string, unknown>;
  } catch (error) {
    throw new RangeError('P2P frame metadata is invalid', { cause: error });
  }
  if (
    metadata.kind === 'request' &&
    typeof metadata.requestId === 'string' &&
    typeof metadata.contentHash === 'string' &&
    typeof metadata.index === 'number' &&
    Number.isSafeInteger(metadata.index)
  ) {
    if (4 + metadataLength !== bytes.byteLength) throw new RangeError('request frame has an unexpected payload');
    return { kind: 'request', requestId: metadata.requestId, contentHash: metadata.contentHash, index: metadata.index };
  }
  if (
    metadata.kind === 'response' &&
    typeof metadata.requestId === 'string' &&
    metadata.ok === true &&
    Number.isSafeInteger(metadata.payloadLength)
  ) {
    const payloadLength = metadata.payloadLength as number;
    if (payloadLength < 0 || 4 + metadataLength + payloadLength !== bytes.byteLength)
      throw new RangeError('response payload is truncated');
    return { kind: 'response', requestId: metadata.requestId, ok: true, payload: bytes.slice(4 + metadataLength) };
  }
  if (
    metadata.kind === 'response' &&
    typeof metadata.requestId === 'string' &&
    metadata.ok === false &&
    typeof metadata.error === 'string'
  ) {
    if (4 + metadataLength !== bytes.byteLength) throw new RangeError('error response has an unexpected payload');
    return { kind: 'response', requestId: metadata.requestId, ok: false, error: metadata.error };
  }
  throw new RangeError('unknown P2P frame kind');
};

export interface P2PDataChannelLike {
  readonly readyState: string;
  binaryType?: string;
  send(data: ArrayBuffer | ArrayBufferView): void;
  close(): void;
  addEventListener(type: 'message' | 'close' | 'error' | 'open', listener: (event: Event) => void): void;
  removeEventListener(type: 'message' | 'close' | 'error' | 'open', listener: (event: Event) => void): void;
}

/** 浏览器 WebRTC DataChannel 适配器；DataChannel 自带 DTLS 加密。 */
export const createWebRTCTransport = (channel: P2PDataChannelLike): P2PByteTransport => {
  channel.binaryType = 'arraybuffer';
  const queue: Uint8Array[] = [];
  const waiters: Array<{
    readonly resolve: (value: Uint8Array) => void;
    readonly reject: (error: unknown) => void;
    readonly cleanup: () => void;
  }> = [];
  let closed = false;
  let failure: unknown;
  const onMessage = (event: Event): void => {
    const data = (event as MessageEvent).data;
    const bytes =
      data instanceof ArrayBuffer ? new Uint8Array(data)
      : data instanceof Uint8Array ? new Uint8Array(data)
      : null;
    if (!bytes) {
      onFailure(new TypeError('WebRTC DataChannel delivered a non-binary frame'));
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter.cleanup();
      waiter.resolve(bytes);
    } else queue.push(bytes);
  };
  const onFailure = (error: unknown): void => {
    failure = error instanceof Error ? error : new Error('WebRTC DataChannel closed');
    closed = true;
    while (waiters.length) {
      const waiter = waiters.shift();
      waiter?.cleanup();
      waiter?.reject(failure);
    }
  };
  const onClose = (): void => onFailure(new Error('WebRTC DataChannel closed'));
  channel.addEventListener('message', onMessage);
  channel.addEventListener('error', onFailure as (event: Event) => void);
  channel.addEventListener('close', onClose);
  return {
    async send(frame) {
      if (closed || channel.readyState !== 'open') throw failure ?? new Error('WebRTC DataChannel is not open');
      channel.send(frame);
    },
    receive(signal) {
      if (queue.length) return Promise.resolve(queue.shift() as Uint8Array);
      if (closed) return Promise.reject(failure ?? new Error('WebRTC DataChannel is closed'));
      if (signal?.aborted)
        return Promise.reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
      return new Promise<Uint8Array>((resolve, reject) => {
        let abort = (): void => undefined;
        const cleanup = (): void => signal?.removeEventListener('abort', abort);
        const waiter = { resolve, reject, cleanup };
        abort = (): void => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          cleanup();
          reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        };
        waiters.push(waiter);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    close() {
      if (closed) return;
      closed = true;
      channel.removeEventListener('message', onMessage);
      channel.removeEventListener('error', onFailure as (event: Event) => void);
      channel.removeEventListener('close', onClose);
      channel.close();
      while (waiters.length) {
        const waiter = waiters.shift();
        waiter?.cleanup();
        waiter?.reject(new Error('WebRTC DataChannel closed'));
      }
    }
  };
};

/** 桌面端 TCP/TLS socket 的最小事件接口，Electron 与 Tauri 均可适配。 */
export interface P2PTcpSocketLike {
  readonly encrypted?: boolean;
  write(data: Uint8Array): void;
  end(): void;
  on(event: 'data' | 'error' | 'close', listener: (value: Uint8Array | Error) => void): void;
  off?(event: 'data' | 'error' | 'close', listener: (value: Uint8Array | Error) => void): void;
}

/** 长度前缀帧：4 字节无符号大端长度 + payload，防止 TCP 粘包/拆包。 */
export const createTcpTransport = (
  socket: P2PTcpSocketLike,
  options: { readonly requireEncryption?: boolean } = {}
): P2PByteTransport => {
  if (options.requireEncryption !== false && socket.encrypted !== true)
    throw new Error('P2P TCP transport requires an encrypted TLS socket');
  const queue: Uint8Array[] = [];
  const waiters: Array<{
    readonly resolve: (value: Uint8Array) => void;
    readonly reject: (error: unknown) => void;
    readonly cleanup: () => void;
  }> = [];
  let buffer = new Uint8Array(0);
  let failure: unknown;
  const flush = (): void => {
    while (buffer.byteLength >= 4) {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const size = view.getUint32(0);
      if (size > 64 * 1024 * 1024) {
        onFailure(new RangeError('P2P TCP frame is too large'));
        return;
      }
      if (buffer.byteLength < size + 4) return;
      const frame = buffer.slice(4, size + 4);
      buffer = buffer.slice(size + 4);
      const waiter = waiters.shift();
      if (waiter) {
        waiter.cleanup();
        waiter.resolve(frame);
      } else queue.push(frame);
    }
  };
  const onData = (value: Uint8Array | Error): void => {
    if (value instanceof Error) return onFailure(value);
    const next = new Uint8Array(buffer.byteLength + value.byteLength);
    next.set(buffer);
    next.set(value, buffer.byteLength);
    buffer = next;
    flush();
  };
  const onFailure = (error: unknown): void => {
    failure = error instanceof Error ? error : new Error('P2P TCP socket closed');
    while (waiters.length) {
      const waiter = waiters.shift();
      waiter?.cleanup();
      waiter?.reject(failure);
    }
  };
  socket.on('data', onData);
  socket.on('error', onFailure as (value: Uint8Array | Error) => void);
  socket.on('close', onFailure as (value: Uint8Array | Error) => void);
  return {
    async send(frame) {
      if (failure) throw failure;
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, frame.byteLength);
      const packet = new Uint8Array(header.byteLength + frame.byteLength);
      packet.set(header);
      packet.set(frame, header.byteLength);
      socket.write(packet);
    },
    receive(signal) {
      if (queue.length) return Promise.resolve(queue.shift() as Uint8Array);
      if (failure) return Promise.reject(failure);
      if (signal?.aborted)
        return Promise.reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
      return new Promise<Uint8Array>((resolve, reject) => {
        let abort = (): void => undefined;
        const cleanup = (): void => signal?.removeEventListener('abort', abort);
        const waiter = { resolve, reject, cleanup };
        abort = (): void => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          cleanup();
          reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        };
        waiters.push(waiter);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    close() {
      onFailure(new Error('P2P TCP transport closed'));
      socket.end();
      if (socket.off) {
        socket.off('data', onData);
        socket.off('error', onFailure as (value: Uint8Array | Error) => void);
        socket.off('close', onFailure as (value: Uint8Array | Error) => void);
      }
    }
  };
};
