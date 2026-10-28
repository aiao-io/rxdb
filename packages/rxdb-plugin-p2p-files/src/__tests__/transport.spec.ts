import { describe, expect, it } from 'vitest';
import { createTcpTransport, createWebRTCTransport, type P2PDataChannelLike, type P2PTcpSocketLike } from '../transport.js';

class FakeDataChannel implements P2PDataChannelLike {
  #listeners = new Map<string, Set<(event: Event) => void>>();
  readyState = 'open';
  binaryType = 'blob';
  sent: Uint8Array[] = [];
  send(data: ArrayBuffer | ArrayBufferView): void {
    this.sent.push(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer, data instanceof ArrayBuffer ? 0 : data.byteOffset, data instanceof ArrayBuffer ? data.byteLength : data.byteLength));
  }
  close(): void { this.readyState = 'closed'; }
  addEventListener(type: 'message' | 'close' | 'error' | 'open', listener: (event: Event) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }
  removeEventListener(type: 'message' | 'close' | 'error' | 'open', listener: (event: Event) => void): void { this.#listeners.get(type)?.delete(listener); }
  emit(type: 'message' | 'close' | 'error' | 'open', data?: Uint8Array): void {
    const event = (type === 'message' ? { data: data?.buffer } : data) as unknown as Event;
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

class FakeSocket implements P2PTcpSocketLike {
  #listeners = new Map<string, Set<(value: Uint8Array | Error) => void>>();
  encrypted = true;
  writes: Uint8Array[] = [];
  write(data: Uint8Array): void { this.writes.push(data); }
  end(): void { /* test socket */ }
  on(event: 'data' | 'error' | 'close', listener: (value: Uint8Array | Error) => void): void {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
  }
  off(event: 'data' | 'error' | 'close', listener: (value: Uint8Array | Error) => void): void { this.#listeners.get(event)?.delete(listener); }
  emit(event: 'data' | 'error' | 'close', value: Uint8Array | Error): void { for (const listener of this.#listeners.get(event) ?? []) listener(value); }
}

describe('P2P transports', () => {
  it('passes binary frames through WebRTC DataChannel', async () => {
    const channel = new FakeDataChannel();
    const transport = createWebRTCTransport(channel);
    await transport.send(new Uint8Array([1, 2]));
    const received = transport.receive();
    channel.emit('message', new Uint8Array([3, 4]));
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
