import { describe, expect, it } from 'vitest';
import { createTcpTransport, type P2PTcpSocketLike } from '../session/tcp-transport.js';
import {
  createWebRTCTransport,
  type P2PDataChannelEvent,
  type P2PDataChannelLike
} from '../session/webrtc-transport.js';

/** 监听器参数按逆变比较：`never` 让各个事件签名都能登记进同一张表，派发时再按 unknown 调用。 */
type SocketListener = (value: never) => void;

class FakeDataChannel implements P2PDataChannelLike {
  #listeners = new Map<string, Set<(event: Event) => void>>();
  readyState = 'open';
  binaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: Uint8Array[] = [];
  send(data: ArrayBuffer | ArrayBufferView): void {
    this.sent.push(
      data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }
  close(): void {
    this.readyState = 'closed';
  }
  addEventListener(type: P2PDataChannelEvent, listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type: P2PDataChannelEvent, listener: (event: Event) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }
  emitMessage(data: Uint8Array): void {
    const event = new MessageEvent('message', { data: data.slice().buffer });
    for (const listener of this.#listeners.get('message') ?? []) listener(event);
  }
}

class FakeSocket implements P2PTcpSocketLike {
  #listeners = new Map<string, Set<SocketListener>>();
  encrypted = true;
  writes: Uint8Array[] = [];
  write(data: Uint8Array): boolean {
    this.writes.push(data);
    return true;
  }
  destroy(): void {
    /* test socket */
  }
  on(event: string, listener: SocketListener): void {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
  }
  off(event: string, listener: SocketListener): void {
    this.#listeners.get(event)?.delete(listener);
  }
  emit(event: string, value?: unknown): void {
    for (const listener of this.#listeners.get(event) ?? []) (listener as (value: unknown) => void)(value);
  }
}

describe('P2P transports', () => {
  it('passes binary frames through a WebRTC DataChannel with a fragment header', async () => {
    const channel = new FakeDataChannel();
    const transport = createWebRTCTransport(channel);
    await transport.send(new Uint8Array([1, 2]));
    expect(channel.sent).toEqual([new Uint8Array([1, 1, 2])]);
    const received = transport.receive();
    channel.emitMessage(new Uint8Array([1, 3, 4]));
    await expect(received).resolves.toEqual(new Uint8Array([3, 4]));
    transport.close();
  });

  it('frames and reassembles encrypted TCP writes split at arbitrary boundaries', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const payload = new Uint8Array([5, 6, 7]);
    await transport.send(payload);
    const received = transport.receive();
    socket.emit('data', socket.writes[0].slice(0, 2));
    socket.emit('data', socket.writes[0].slice(2));
    await expect(received).resolves.toEqual(payload);
    transport.close();
  });
});
