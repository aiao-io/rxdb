import { describe, expect, it } from 'vitest';
import { createP2PFileManifest } from './chunking';
import {
  createP2PTransportPeer,
  createTcpTransport,
  createWebRTCTransport,
  decodeP2PFrame,
  encodeP2PFrame,
  type P2PByteTransport
} from './transport';

type Listener = (event: Event) => void;

class FakeChannel {
  readyState = 'open';
  binaryType = '';
  readonly sent: Uint8Array[] = [];
  readonly listeners = new Map<string, Set<Listener>>();

  send(data: ArrayBuffer | ArrayBufferView): void {
    this.sent.push(
      data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }

  close(): void {
    this.readyState = 'closed';
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data?: unknown): void {
    const event =
      type === 'message' ? new MessageEvent(type, { data })
      : data instanceof Error ? data
      : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) listener(event as Event);
  }
}

class FakeSocket {
  encrypted = true;
  readonly writes: Uint8Array[] = [];
  readonly listeners = new Map<string, Set<(value: Uint8Array | Error) => void>>();

  write(data: Uint8Array): void {
    this.writes.push(new Uint8Array(data));
  }

  end(): void {
    this.emit('close', new Error('closed'));
  }

  on(event: string, listener: (value: Uint8Array | Error) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (value: Uint8Array | Error) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, value: Uint8Array | Error): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

class LinkedTransport implements P2PByteTransport {
  peer?: LinkedTransport;
  readonly queue: Uint8Array[] = [];
  readonly waiters: Array<(frame: Uint8Array) => void> = [];
  closed = false;

  async send(frame: Uint8Array): Promise<void> {
    this.peer?.deliver(frame);
  }

  receive(signal?: AbortSignal): Promise<Uint8Array> {
    if (this.queue.length) return Promise.resolve(this.queue.shift() as Uint8Array);
    if (this.closed) return Promise.reject(new Error('closed'));
    return new Promise((resolve, reject) => {
      const waiter = (frame: Uint8Array): void => resolve(frame);
      this.waiters.push(waiter);
      signal?.addEventListener(
        'abort',
        () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(signal.reason ?? new Error('aborted'));
        },
        { once: true }
      );
    });
  }

  close(): void {
    this.closed = true;
    while (this.waiters.length) this.waiters.shift()?.(new Uint8Array());
  }

  deliver(frame: Uint8Array): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(frame);
    else this.queue.push(frame);
  }
}

describe('P2P 字节传输适配器', () => {
  it('编码和解码请求、成功响应、错误响应帧', () => {
    const request = { kind: 'request' as const, requestId: 'r1', contentHash: 'hash', index: 2 };
    expect(decodeP2PFrame(encodeP2PFrame(request))).toEqual(request);
    const response = { kind: 'response' as const, requestId: 'r1', ok: true as const, payload: new Uint8Array([1, 2]) };
    expect(decodeP2PFrame(encodeP2PFrame(response))).toMatchObject(response);
    const error = { kind: 'response' as const, requestId: 'r1', ok: false as const, error: 'bad chunk' };
    expect(decodeP2PFrame(encodeP2PFrame(error))).toEqual(error);
    expect(() => decodeP2PFrame(new Uint8Array([0, 0, 0]))).toThrow(RangeError);
    expect(() => decodeP2PFrame(new TextEncoder().encode('invalid'))).toThrow(RangeError);
  });

  it('在 WebRTC DataChannel 上发送、排队和接收二进制帧', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    expect(channel.binaryType).toBe('arraybuffer');
    await transport.send(new Uint8Array([1, 2]));
    expect(channel.sent).toEqual([new Uint8Array([1, 2])]);
    channel.emit('message', new Uint8Array([3]));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([3]));
    const pending = transport.receive();
    channel.emit('message', new Uint8Array([4]));
    await expect(pending).resolves.toEqual(new Uint8Array([4]));
    channel.emit('message', 'not binary');
    await expect(transport.receive()).rejects.toThrow('non-binary');
    await expect(transport.send(new Uint8Array([5]))).rejects.toThrow('non-binary');
  });

  it('WebRTC 接收支持取消和关闭清理', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    transport.close();
    await expect(transport.receive()).rejects.toThrow('closed');
    expect(channel.readyState).toBe('closed');
  });

  it('WebRTC 适配器接受 ArrayBuffer，并传播 error/close 事件', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const buffer = new ArrayBuffer(1);
    new Uint8Array(buffer)[0] = 7;
    channel.emit('message', buffer);
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([7]));
    const pending = transport.receive();
    channel.emit('error', new Error('channel error'));
    await expect(pending).rejects.toThrow('channel error');
    await expect(transport.send(new Uint8Array())).rejects.toThrow('channel error');

    const closedChannel = new FakeChannel();
    const closedTransport = createWebRTCTransport(closedChannel);
    const closing = closedTransport.receive();
    closedChannel.emit('close');
    await expect(closing).rejects.toThrow('closed');
  });

  it('WebRTC 在创建时已关闭时拒绝发送，关闭时唤醒等待者', async () => {
    const channel = new FakeChannel();
    channel.readyState = 'closed';
    const transport = createWebRTCTransport(channel);
    await expect(transport.send(new Uint8Array())).rejects.toThrow('not open');
    const pending = transport.receive();
    transport.close();
    await expect(pending).rejects.toThrow('closed');
  });

  it('TCP transport 处理长度前缀的拆包和粘包', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    await transport.send(new Uint8Array([1, 2]));
    expect(socket.writes[0]).toEqual(new Uint8Array([0, 0, 0, 2, 1, 2]));
    const first = transport.receive();
    socket.emit('data', socket.writes[0].slice(0, 3));
    socket.emit('data', socket.writes[0].slice(3));
    await expect(first).resolves.toEqual(new Uint8Array([1, 2]));
    const second = new Uint8Array([0, 0, 0, 1, 9]);
    socket.emit('data', Uint8Array.from([...second, ...second]));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([9]));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([9]));
    await transport.close();
  });

  it('TCP transport 强制加密、支持取消并拒绝超大帧', async () => {
    const plain = new FakeSocket();
    plain.encrypted = false;
    expect(() => createTcpTransport(plain)).toThrow('requires an encrypted TLS socket');
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    const malformed = new Uint8Array(4);
    new DataView(malformed.buffer).setUint32(0, 64 * 1024 * 1024 + 1);
    socket.emit('data', malformed);
    await expect(transport.receive()).rejects.toThrow('too large');
  });

  it('TCP socket error 会拒绝等待者和后续发送', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const pending = transport.receive();
    socket.emit('error', new Error('socket error'));
    await expect(pending).rejects.toThrow('socket error');
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('socket error');

    const withoutOff = new FakeSocket();
    withoutOff.off = undefined;
    const unhooked = createTcpTransport(withoutOff);
    await unhooked.close();
  });

  it('双向 transport peer 可并发请求并校验响应块', async () => {
    const bytes = Uint8Array.from({ length: 6 }, (_, index) => index + 1);
    const manifest = await createP2PFileManifest({
      fileName: 'peer.bin',
      size: bytes.byteLength,
      chunkSize: 3,
      readChunk: async (offset, size) => bytes.slice(offset, offset + size)
    });
    const left = new LinkedTransport();
    const right = new LinkedTransport();
    left.peer = right;
    right.peer = left;
    const local = createP2PTransportPeer(left, 'left', manifest, async index => bytes.slice(index * 3, index * 3 + 3));
    createP2PTransportPeer(right, 'right', manifest, async index => bytes.slice(index * 3, index * 3 + 3));
    await expect(
      Promise.all([
        local.source.requestChunk(manifest.contentHash, 0, new AbortController().signal),
        local.source.requestChunk(manifest.contentHash, 1, new AbortController().signal)
      ])
    ).resolves.toEqual([bytes.slice(0, 3), bytes.slice(3)]);
    await local.close();
  });
});
