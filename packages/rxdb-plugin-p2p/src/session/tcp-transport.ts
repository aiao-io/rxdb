/** 桌面端 TCP/TLS 字节传输适配器。 */
import { asError } from './errors.js';
import { EventGate, FrameInbox } from './frame-queue.js';
import type { P2PByteTransport } from './frame.js';
import { MAX_FRAME_SIZE } from './limits.js';

/** 桌面端 TCP/TLS socket 的最小事件接口，Electron（Node `tls.TLSSocket`）与 Tauri 均可适配。 */
export interface P2PTcpSocketLike {
  /** TLS 握手完成的 socket 为 true；默认拒绝明文 socket。 */
  readonly encrypted?: boolean;
  /** 写入一段字节；返回 false 表示写缓冲已满，须等 `drain` 再写。 */
  write(data: Uint8Array): boolean | void;
  /** 立即关闭连接并释放底层资源。 */
  destroy(): void;
  /** 订阅 socket 事件：`data` 带字节，`error` 带错误，`close` / `drain` 不带参数。 */
  on(event: 'data', listener: (chunk: Uint8Array) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'close' | 'drain', listener: () => void): void;
  /** 退订 socket 事件。 */
  off(event: 'data', listener: (chunk: Uint8Array) => void): void;
  off(event: 'error', listener: (error: Error) => void): void;
  off(event: 'close' | 'drain', listener: () => void): void;
}

/** 线性时间的字节队列：数据只在取出整帧时拷贝一次，不随每个 data 事件整块重分配。 */
class ByteQueue {
  readonly #chunks: Uint8Array[] = [];
  #length = 0;

  get length(): number {
    return this.#length;
  }

  push(chunk: Uint8Array): void {
    this.#chunks.push(chunk);
    this.#length += chunk.byteLength;
  }

  peekUint32(): number {
    return new DataView(this.#copy(4).buffer).getUint32(0);
  }

  take(count: number): Uint8Array {
    const bytes = this.#copy(count);
    this.skip(count);
    return bytes;
  }

  skip(count: number): void {
    this.#length -= count;
    let remaining = count;
    while (remaining > 0) {
      const head = this.#chunks[0];
      if (head.byteLength > remaining) {
        this.#chunks[0] = head.subarray(remaining);
        return;
      }
      this.#chunks.shift();
      remaining -= head.byteLength;
    }
  }

  #copy(count: number): Uint8Array {
    const result = new Uint8Array(count);
    let filled = 0;
    for (let index = 0; filled < count; index += 1) {
      const part = this.#chunks[index].subarray(0, count - filled);
      result.set(part, filled);
      filled += part.byteLength;
    }
    return result;
  }
}

/** 从字节队列取出一帧；数据不够时返回 undefined，帧头超过协议上限时抛错。 */
const nextFrame = (buffer: ByteQueue): Uint8Array | undefined => {
  if (buffer.length < 4) return undefined;
  const size = buffer.peekUint32();
  if (size > MAX_FRAME_SIZE) throw new RangeError('P2P TCP frame is too large');
  if (buffer.length < 4 + size) return undefined;
  buffer.skip(4);
  return buffer.take(size);
};

const packetOf = (frame: Uint8Array): Uint8Array => {
  const packet = new Uint8Array(4 + frame.byteLength);
  new DataView(packet.buffer).setUint32(0, frame.byteLength);
  packet.set(frame, 4);
  return packet;
};

/**
 * 桌面 TCP/TLS 适配器：4 字节无符号大端长度前缀 + 帧，防止粘包/拆包。
 *
 * @remarks
 * 帧头超过协议最大帧立即判失败；写缓冲已满时等 `drain`。失败或关闭时销毁 socket 并停止缓冲，
 * 但保留 `error` 监听，晚到的 socket 错误不会变成未处理异常。
 *
 * @throws Error `requireEncryption` 未关闭而 socket 不是 TLS
 */
export const createTcpTransport = (
  socket: P2PTcpSocketLike,
  options: { readonly requireEncryption?: boolean } = {}
): P2PByteTransport => {
  if (options.requireEncryption !== false && socket.encrypted !== true)
    throw new Error('P2P TCP transport requires an encrypted TLS socket');
  const buffer = new ByteQueue();
  const drained = new EventGate();
  const inbox = new FrameInbox(error => fail(error));

  const onData = (chunk: Uint8Array): void => {
    buffer.push(chunk);
    try {
      for (let frame = nextFrame(buffer); frame; frame = nextFrame(buffer)) inbox.push(frame);
    } catch (error) {
      fail(asError(error));
    }
  };
  const onError = (error: Error): void => fail(error);
  const onClose = (): void => fail(new Error('P2P TCP socket closed'));
  const onDrain = (): void => drained.open();

  function fail(error: Error): void {
    if (inbox.failure) return;
    inbox.fail(error);
    drained.fail(error);
    socket.off('data', onData);
    socket.off('drain', onDrain);
    socket.destroy();
  }

  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);
  socket.on('drain', onDrain);
  return {
    async send(frame) {
      if (inbox.failure) throw inbox.failure;
      if (frame.byteLength > MAX_FRAME_SIZE) throw new RangeError('P2P frame is too large');
      if (socket.write(packetOf(frame)) === false) await drained.wait();
    },
    receive: signal => inbox.receive(signal),
    close() {
      fail(new Error('P2P TCP transport closed'));
    }
  };
};
