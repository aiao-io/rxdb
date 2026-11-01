/** 浏览器 WebRTC DataChannel 字节传输适配器。 */
import { asError } from './errors.js';
import { EventGate, FrameInbox } from './frame-queue.js';
import type { P2PByteTransport } from './frame.js';
import { MAX_FRAME_SIZE } from './limits.js';

/** DataChannel 事件名。 */
export type P2PDataChannelEvent = 'message' | 'close' | 'error' | 'open' | 'bufferedamountlow';

/** 浏览器 `RTCDataChannel` 的最小接口。 */
export interface P2PDataChannelLike {
  /** 通道状态：`connecting` / `open` / `closing` / `closed`。 */
  readonly readyState: string;
  /** 适配器会设为 `arraybuffer`。 */
  binaryType: string;
  /** 已排队但尚未发出的字节数。 */
  readonly bufferedAmount: number;
  /** `bufferedamountlow` 事件的触发阈值，适配器会设置它。 */
  bufferedAmountLowThreshold: number;
  /** 发送一条二进制消息。 */
  send(data: ArrayBuffer | ArrayBufferView): void;
  /** 关闭通道。 */
  close(): void;
  /** 订阅通道事件。 */
  addEventListener(type: P2PDataChannelEvent, listener: (event: Event) => void): void;
  /** 退订通道事件。 */
  removeEventListener(type: P2PDataChannelEvent, listener: (event: Event) => void): void;
}

/** WebRTC 适配器选项。 */
export interface P2PWebRTCTransportOptions {
  /**
   * 单条消息的字节上限（含 1 字节分片头），默认 65536，即 SCTP 未协商时的下限。
   * 可传 `RTCPeerConnection.sctp.maxMessageSize`。
   */
  readonly maxMessageSize?: number;
}

const DEFAULT_MAX_MESSAGE_SIZE = 64 * 1024;
const SEND_HIGH_WATER = 1024 * 1024;
const SEND_LOW_WATER = 256 * 1024;
const FRAGMENT_MORE = 0;
const FRAGMENT_LAST = 1;

function* fragmentsOf(frame: Uint8Array, maxPayload: number): Generator<Uint8Array> {
  const count = Math.max(1, Math.ceil(frame.byteLength / maxPayload));
  for (let index = 0; index < count; index += 1) {
    const payload = frame.subarray(index * maxPayload, (index + 1) * maxPayload);
    const message = new Uint8Array(payload.byteLength + 1);
    message[0] = index === count - 1 ? FRAGMENT_LAST : FRAGMENT_MORE;
    message.set(payload, 1);
    yield message;
  }
}

const concatBytes = (parts: readonly Uint8Array[], length: number): Uint8Array => {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

/** 按序重组分片；单帧超过协议上限或分片头非法即报错。 */
class FragmentAssembler {
  #parts: Uint8Array[] = [];
  #length = 0;

  add(message: Uint8Array): Uint8Array | undefined {
    const flag = message[0];
    if (flag !== FRAGMENT_MORE && flag !== FRAGMENT_LAST) throw new RangeError('invalid P2P fragment header');
    this.#length += message.byteLength - 1;
    if (this.#length > MAX_FRAME_SIZE) throw new RangeError('P2P frame is too large');
    this.#parts.push(message.subarray(1));
    if (flag === FRAGMENT_MORE) return undefined;
    const frame = concatBytes(this.#parts, this.#length);
    this.#parts = [];
    this.#length = 0;
    return frame;
  }
}

const messageBytes = (data: unknown): Uint8Array => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('WebRTC DataChannel delivered a non-binary frame');
};

const channelErrorOf = (event: Event): Error => {
  const error = (event as Event & { readonly error?: unknown }).error;
  return error instanceof Error ? error : new Error('WebRTC DataChannel error');
};

/**
 * 浏览器 WebRTC DataChannel 适配器；DataChannel 自带 DTLS 加密。
 *
 * @remarks
 * 帧按消息上限分片：每条消息首字节 0 表示后面还有分片、1 表示末片，大块不受 SCTP 消息上限约束。
 * 发送串行进行；通道还在建立时等 `open`，发送缓冲超过 1 MiB 时等 `bufferedamountlow`。
 * 任何失败（错误事件、关闭、非二进制消息、非法分片）都会关闭通道并摘掉监听，首个失败原因保留到底。
 *
 * @throws RangeError `maxMessageSize` 小于 2 字节或不是整数
 */
export const createWebRTCTransport = (
  channel: P2PDataChannelLike,
  options: P2PWebRTCTransportOptions = {}
): P2PByteTransport => {
  const maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  if (!Number.isSafeInteger(maxMessageSize) || maxMessageSize < 2)
    throw new RangeError('maxMessageSize must be an integer of at least 2 bytes');
  const assembler = new FragmentAssembler();
  const opened = new EventGate();
  const drained = new EventGate();
  let sendQueue: Promise<void> = Promise.resolve();
  const inbox = new FrameInbox(error => fail(error));

  const onMessage = (event: Event): void => {
    try {
      const frame = assembler.add(messageBytes((event as MessageEvent).data));
      if (frame) inbox.push(frame);
    } catch (error) {
      fail(asError(error));
    }
  };
  const onError = (event: Event): void => fail(channelErrorOf(event));
  const onClose = (): void => fail(new Error('WebRTC DataChannel closed'));
  const onOpen = (): void => opened.open();
  const onLow = (): void => drained.open();
  const listeners: ReadonlyArray<readonly [P2PDataChannelEvent, (event: Event) => void]> = [
    ['message', onMessage],
    ['error', onError],
    ['close', onClose],
    ['open', onOpen],
    ['bufferedamountlow', onLow]
  ];

  function fail(error: Error): void {
    if (inbox.failure) return;
    inbox.fail(error);
    opened.fail(error);
    drained.fail(error);
    for (const [type, listener] of listeners) channel.removeEventListener(type, listener);
    channel.close();
  }

  const sendFragments = async (frame: Uint8Array): Promise<void> => {
    if (channel.readyState === 'connecting') await opened.wait();
    for (const message of fragmentsOf(frame, maxMessageSize - 1)) {
      if (channel.bufferedAmount > SEND_HIGH_WATER) await drained.wait();
      if (inbox.failure) throw inbox.failure;
      channel.send(message);
    }
  };

  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = SEND_LOW_WATER;
  for (const [type, listener] of listeners) channel.addEventListener(type, listener);
  if (channel.readyState !== 'open' && channel.readyState !== 'connecting')
    fail(new Error('WebRTC DataChannel is not open'));

  return {
    send(frame) {
      if (inbox.failure) return Promise.reject(inbox.failure);
      const task = sendQueue.then(() => sendFragments(frame));
      sendQueue = task.catch((error: unknown) => fail(asError(error)));
      return task;
    },
    receive: signal => inbox.receive(signal),
    close() {
      fail(new Error('WebRTC DataChannel closed'));
    }
  };
};
