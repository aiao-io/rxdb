import { describe, expect, it } from 'vitest';
import { createP2PFileManifest, DEFAULT_P2P_CHUNK_SIZE, type P2PFileManifest } from './chunking.js';
import { decodeP2PFrame, encodeP2PFrame, type P2PByteTransport, type P2PFrame } from './frame.js';
import { createTcpTransport, type P2PTcpSocketLike } from './tcp-transport.js';
import { transferP2PFile } from './transfer.js';
import { createP2PTransportPeer } from './transport.js';
import { createWebRTCTransport, type P2PDataChannelLike } from './webrtc-transport.js';

type Listener = (event: Event) => void;
/** 监听器参数按逆变比较：`never` 让各个事件签名都能登记进同一张表，派发时再按 unknown 调用。 */
type SocketListener = (value: never) => void;

const delay = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));
const tick = (): Promise<void> => delay(0);
const isSettled = async (promise: Promise<unknown>): Promise<boolean> => {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await tick();
  return settled;
};

/** 一条完整帧放在单个末片里：1 字节分片头（1 = 末片）+ 负载。 */
const lastFragment = (...bytes: number[]): Uint8Array => Uint8Array.from([1, ...bytes]);

class FakeChannel implements P2PDataChannelLike {
  readyState = 'open';
  binaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  maxMessageSize = 65536;
  peer?: FakeChannel;
  readonly sent: Uint8Array[] = [];
  readonly listeners = new Map<string, Set<Listener>>();

  send(data: ArrayBuffer | ArrayBufferView): void {
    const bytes =
      data instanceof ArrayBuffer ?
        new Uint8Array(data.slice(0))
      : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    if (bytes.byteLength > this.maxMessageSize) throw new RangeError('negotiated message size exceeded');
    this.sent.push(bytes);
    const peer = this.peer;
    if (peer) queueMicrotask(() => peer.emit('message', bytes.buffer));
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

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  emit(type: string, data?: unknown): void {
    const event =
      type === 'message' ? new MessageEvent('message', { data })
      : type === 'error' ? Object.assign(new Event('error'), { error: data })
      : new Event(type);
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

const linkedChannels = (): [FakeChannel, FakeChannel] => {
  const left = new FakeChannel();
  const right = new FakeChannel();
  left.peer = right;
  right.peer = left;
  return [left, right];
};

class FakeSocket implements P2PTcpSocketLike {
  encrypted = true;
  destroyed = false;
  writeReturns = true;
  readonly writes: Uint8Array[] = [];
  readonly listeners = new Map<string, Set<SocketListener>>();

  write(data: Uint8Array): boolean {
    this.writes.push(new Uint8Array(data));
    return this.writeReturns;
  }

  destroy(): void {
    this.destroyed = true;
  }

  on(event: string, listener: SocketListener): void {
    const listeners = this.listeners.get(event) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: SocketListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** 与 Node EventEmitter 一致：没有监听者的 'error' 事件直接抛出。 */
  emit(event: string, value?: unknown): void {
    const listeners = [...(this.listeners.get(event) ?? [])];
    if (event === 'error' && listeners.length === 0) throw value;
    for (const listener of listeners) (listener as (value: unknown) => void)(value);
  }
}

const frameHeader = (size: number): Uint8Array => {
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, size);
  return header;
};

class LinkedTransport implements P2PByteTransport {
  peer?: LinkedTransport;
  closed = false;
  failSend = false;
  sendGate?: Promise<void>;
  readonly queue: Uint8Array[] = [];
  readonly waiters: Array<{ resolve: (frame: Uint8Array) => void; reject: (error: Error) => void }> = [];

  async send(frame: Uint8Array): Promise<void> {
    if (this.failSend) throw new Error('send failed');
    if (this.closed) throw new Error('closed');
    await this.sendGate;
    this.peer?.deliver(frame);
  }

  receive(signal?: AbortSignal): Promise<Uint8Array> {
    if (this.queue.length) return Promise.resolve(this.queue.shift() as Uint8Array);
    if (this.closed) return Promise.reject(new Error('closed'));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waiters.push(waiter);
      signal?.addEventListener(
        'abort',
        () => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(signal.reason as Error);
        },
        { once: true }
      );
    });
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('closed'));
  }

  deliver(frame: Uint8Array): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(frame);
    else this.queue.push(frame);
  }
}

const linkedTransports = (): [LinkedTransport, LinkedTransport] => {
  const left = new LinkedTransport();
  const right = new LinkedTransport();
  left.peer = right;
  right.peer = left;
  return [left, right];
};

const fileOf = (bytes: Uint8Array, chunkSize: number): Promise<P2PFileManifest> =>
  createP2PFileManifest({
    fileName: 'peer.bin',
    size: bytes.byteLength,
    chunkSize,
    readChunk: async (offset, size) => bytes.slice(offset, offset + size)
  });

const rangeReader =
  (bytes: Uint8Array) =>
  async (offset: number, size: number): Promise<Uint8Array> =>
    bytes.slice(offset, offset + size);

const allow = (): void => undefined;
const request = (requestId: string, contentHash: string, offset = 0, size = 3): Uint8Array =>
  encodeP2PFrame({ kind: 'request', requestId, contentHash, offset, size });

describe('P2P 帧编解码', () => {
  it('编码和解码请求、成功响应、错误响应帧', () => {
    const requestFrame: P2PFrame = { kind: 'request', requestId: 'r1', contentHash: 'hash', offset: 6, size: 3 };
    expect(decodeP2PFrame(encodeP2PFrame(requestFrame))).toEqual(requestFrame);
    const response = { kind: 'response' as const, requestId: 'r1', ok: true as const, payload: new Uint8Array([1, 2]) };
    expect(decodeP2PFrame(encodeP2PFrame(response))).toMatchObject(response);
    const error = { kind: 'response' as const, requestId: 'r1', ok: false as const, error: 'bad chunk' };
    expect(decodeP2PFrame(encodeP2PFrame(error))).toEqual(error);
    expect(() => decodeP2PFrame(new Uint8Array([0, 0, 0]))).toThrow(RangeError);
    expect(() => decodeP2PFrame(new TextEncoder().encode('invalid'))).toThrow(RangeError);
  });

  it('拒绝越界的请求区间与超长元数据，错误文本截断后再编码', () => {
    for (const range of [
      { offset: -1, size: 3 },
      { offset: 0, size: 0 },
      { offset: 0, size: 2 * 1024 * 1024 },
      { offset: 1.5, size: 3 }
    ]) {
      expect(() => decodeP2PFrame(request('r1', 'hash', range.offset, range.size))).toThrow(RangeError);
    }
    const oversized = new Uint8Array(4 + 64 * 1024);
    new DataView(oversized.buffer).setUint32(0, 64 * 1024);
    expect(() => decodeP2PFrame(oversized)).toThrow(RangeError);
    const longError = encodeP2PFrame({ kind: 'response', requestId: 'r1', ok: false, error: 'x'.repeat(10_000) });
    const decoded = decodeP2PFrame(longError);
    expect(decoded.kind === 'response' && !decoded.ok && decoded.error.length).toBeLessThanOrEqual(1024);
  });
});

describe('WebRTC DataChannel 适配器', () => {
  it('默认块加协议元数据放得进一条 64 KiB 消息，不必分片', async () => {
    const bytes = new Uint8Array(DEFAULT_P2P_CHUNK_SIZE);
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const frame = encodeP2PFrame({ kind: 'response', requestId: 'peer:0', ok: true, payload: bytes });
    await transport.send(frame);
    expect(channel.binaryType).toBe('arraybuffer');
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].byteLength).toBeLessThanOrEqual(65536);
    channel.emit('message', channel.sent[0].buffer);
    expect(decodeP2PFrame(await transport.receive())).toMatchObject({ payload: bytes });
    transport.close();
  });

  it('超过消息上限的帧分片发送、按序重组', async () => {
    const frame = Uint8Array.from({ length: 300 * 1024 }, (_, index) => index % 253);
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    await transport.send(frame);
    expect(channel.sent.length).toBeGreaterThan(4);
    expect(channel.sent.every(message => message.byteLength <= 65536)).toBe(true);
    for (const message of channel.sent) channel.emit('message', message.buffer);
    await expect(transport.receive()).resolves.toEqual(frame);
    transport.close();
  });

  it('消息上限可按 SCTP 协商结果调小', async () => {
    const channel = new FakeChannel();
    channel.maxMessageSize = 16 * 1024;
    const transport = createWebRTCTransport(channel, { maxMessageSize: 16 * 1024 });
    await transport.send(new Uint8Array(40 * 1024));
    expect(channel.sent.every(message => message.byteLength <= 16 * 1024)).toBe(true);
    transport.close();
  });

  it('并发发送的大帧不会互相穿插分片', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const first = new Uint8Array(150 * 1024).fill(1);
    const second = new Uint8Array(150 * 1024).fill(2);
    await Promise.all([transport.send(first), transport.send(second)]);
    for (const message of channel.sent) channel.emit('message', message.buffer);
    await expect(transport.receive()).resolves.toEqual(first);
    await expect(transport.receive()).resolves.toEqual(second);
    transport.close();
  });

  it('DataChannel 还在建立时，发送等到 open 再发', async () => {
    const channel = new FakeChannel();
    channel.readyState = 'connecting';
    const transport = createWebRTCTransport(channel);
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    channel.readyState = 'open';
    channel.emit('open');
    await sending;
    expect(channel.sent).toEqual([lastFragment(1)]);
    transport.close();
  });

  it('发送缓冲超过高水位时等 bufferedamountlow 再发', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    channel.bufferedAmount = 4 * 1024 * 1024;
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    channel.bufferedAmount = 0;
    channel.emit('bufferedamountlow');
    await sending;
    expect(channel.sent).toHaveLength(1);
    transport.close();
  });

  it('error 事件保留 RTCError 原因，随后的 close 不覆盖它', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const pending = transport.receive();
    channel.emit('error', new Error('sctp failure'));
    channel.emit('close');
    await expect(pending).rejects.toThrow('sctp failure');
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('sctp failure');
  });

  it('收到非二进制消息或非法分片头即判失败：关闭通道并摘掉监听', async () => {
    for (const data of ['not binary', Uint8Array.from([7, 1]).buffer]) {
      const channel = new FakeChannel();
      const transport = createWebRTCTransport(channel);
      channel.emit('message', data);
      await expect(transport.receive()).rejects.toThrow(/non-binary|fragment/);
      expect(channel.readyState).toBe('closed');
      expect(channel.listenerCount('message')).toBe(0);
    }
  });

  it('接收 ArrayBuffer 与视图，支持取消和关闭清理', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    channel.emit('message', lastFragment(7).buffer);
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([7]));
    channel.emit('message', lastFragment(8));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([8]));
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    const closing = transport.receive();
    transport.close();
    await expect(closing).rejects.toThrow('closed');
    expect(channel.readyState).toBe('closed');
  });

  it('创建时已关闭的通道拒绝收发', async () => {
    const channel = new FakeChannel();
    channel.readyState = 'closed';
    const transport = createWebRTCTransport(channel);
    await expect(transport.send(new Uint8Array())).rejects.toThrow('not open');
    await expect(transport.receive()).rejects.toThrow('not open');
  });
});

describe('TCP/TLS 适配器', () => {
  it('处理长度前缀的拆包和粘包', async () => {
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
    transport.close();
  });

  it('跨很多次 data 事件到达的大帧完整重组', async () => {
    const payload = Uint8Array.from({ length: 300_000 }, (_, index) => index % 249);
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const packet = Uint8Array.from([...frameHeader(payload.byteLength), ...payload]);
    for (let offset = 0; offset < packet.byteLength; offset += 1000)
      socket.emit('data', packet.slice(offset, offset + 1000));
    await expect(transport.receive()).resolves.toEqual(payload);
    transport.close();
  });

  it('强制加密并支持取消接收', async () => {
    const plain = new FakeSocket();
    plain.encrypted = false;
    expect(() => createTcpTransport(plain)).toThrow('requires an encrypted TLS socket');
    const transport = createTcpTransport(new FakeSocket());
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    transport.close();
  });

  it('帧头超过协议最大帧立即判失败：销毁 socket，之后到达的数据不再缓冲', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    socket.emit('data', frameHeader(2 * 1024 * 1024));
    await expect(transport.receive()).rejects.toThrow('too large');
    expect(socket.destroyed).toBe(true);
    expect(socket.listenerCount('data')).toBe(0);
    expect(() => socket.emit('error', new Error('ECONNRESET'))).not.toThrow();
  });

  it('close 销毁 socket 并保留 error 监听，晚到的 socket 错误不会变成未处理异常', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const pending = transport.receive();
    transport.close();
    await expect(pending).rejects.toThrow('transport closed');
    expect(socket.destroyed).toBe(true);
    expect(() => socket.emit('error', new Error('ECONNRESET'))).not.toThrow();
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('transport closed');
  });

  it('写缓冲满时 send 等 drain 才完成', async () => {
    const socket = new FakeSocket();
    socket.writeReturns = false;
    const transport = createTcpTransport(socket);
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    socket.emit('drain');
    await sending;
    transport.close();
  });

  it('socket 出错时拒绝等待者和后续发送', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const pending = transport.receive();
    socket.emit('error', new Error('socket error'));
    await expect(pending).rejects.toThrow('socket error');
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('socket error');
    expect(socket.destroyed).toBe(true);
  });
});

describe('P2P 传输会话', () => {
  it('双向会话可并发请求，按字节区间取数', async () => {
    const bytes = Uint8Array.from({ length: 6 }, (_, index) => index + 1);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    const local = createP2PTransportPeer(left, 'left', manifest, rangeReader(bytes), { authorizeRequest: allow });
    const remote = createP2PTransportPeer(right, 'right', manifest, rangeReader(bytes), { authorizeRequest: allow });
    const signal = new AbortController().signal;
    await expect(
      Promise.all([
        local.source.requestChunk({ contentHash: manifest.contentHash, offset: 0, size: 3 }, signal),
        local.source.requestChunk({ contentHash: manifest.contentHash, offset: 3, size: 3 }, signal)
      ])
    ).resolves.toEqual([bytes.slice(0, 3), bytes.slice(3)]);
    await local.close();
    await remote.close();
  });

  it('持有方块大小与请求方不同也能供块：按请求方清单的字节区间取数', async () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index * 3 + 1);
    const requesterManifest = await fileOf(bytes, 3);
    const holderManifest = await fileOf(bytes, 4);
    expect(holderManifest.contentHash).toBe(requesterManifest.contentHash);
    const [left, right] = linkedTransports();
    const requester = createP2PTransportPeer(left, 'holder', requesterManifest, rangeReader(bytes), {});
    const holder = createP2PTransportPeer(right, 'requester', holderManifest, rangeReader(bytes), {
      authorizeRequest: allow
    });
    const written = new Map<number, Uint8Array>();
    await expect(
      transferP2PFile({
        manifest: requesterManifest,
        sources: [requester.source],
        writeChunk: async (index, chunk) => void written.set(index, chunk)
      })
    ).resolves.toMatchObject({ completedChunks: 4, sourcesUsed: ['holder'] });
    await requester.close();
    await holder.close();
  });

  it('入站请求先过认证钩子，拒绝未授权请求', async () => {
    const bytes = Uint8Array.from({ length: 3 }, (_, index) => index + 1);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    const contexts: unknown[] = [];
    let permitted = true;
    const local = createP2PTransportPeer(left, 'local', manifest, rangeReader(bytes), { authorizeRequest: allow });
    const remote = createP2PTransportPeer(right, 'remote', manifest, rangeReader(bytes), {
      authenticatedContext: { subject: 'user-a' },
      authorizeRequest: context => {
        contexts.push({ ...context, signal: undefined });
        if (!permitted) throw new Error('unauthorized');
      }
    });
    const chunk = { contentHash: manifest.contentHash, offset: 0, size: 3 };
    await expect(local.source.requestChunk(chunk, new AbortController().signal)).resolves.toEqual(bytes);
    permitted = false;
    await expect(local.source.requestChunk(chunk, new AbortController().signal)).rejects.toThrow('unauthorized');
    expect(contexts).toEqual([
      expect.objectContaining({
        contentHash: manifest.contentHash,
        offset: 0,
        size: 3,
        authenticatedContext: { subject: 'user-a' }
      }),
      expect.objectContaining({ authenticatedContext: { subject: 'user-a' } })
    ]);
    await local.close();
    await remote.close();
  });

  it('入站请求超过并发上限时排队等候，而不是直接拒绝', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    let release!: () => void;
    const firstRead = new Promise<void>(resolve => (release = resolve));
    let reads = 0;
    const local = createP2PTransportPeer(left, 'local', manifest, rangeReader(bytes), {});
    const remote = createP2PTransportPeer(
      right,
      'remote',
      manifest,
      async () => {
        reads += 1;
        if (reads === 1) await firstRead;
        return bytes;
      },
      { maxInboundRequests: 1, authorizeRequest: allow }
    );
    const chunk = { contentHash: manifest.contentHash, offset: 0, size: 3 };
    const first = local.source.requestChunk(chunk, new AbortController().signal);
    const second = local.source.requestChunk(chunk, new AbortController().signal);
    await tick();
    expect(reads).toBe(1);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([bytes, bytes]);
    await local.close();
    await remote.close();
  });

  it('慢接收端占住入站名额：响应发不出去时不会继续读盘', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    left.sendGate = new Promise<void>(() => undefined);
    let reads = 0;
    const peer = createP2PTransportPeer(
      left,
      'served',
      manifest,
      async () => {
        reads += 1;
        return bytes;
      },
      { authorizeRequest: allow }
    );
    for (let index = 0; index < 20; index += 1) await right.send(request(`r${index}`, manifest.contentHash));
    await delay(5);
    expect(reads).toBe(8);
    left.sendGate = undefined;
    await peer.close();
  });

  it('对端未完成请求超过协议上限即结束会话并关闭底层传输', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    const peer = createP2PTransportPeer(left, 'flooded', manifest, () => new Promise<Uint8Array>(() => undefined), {
      authorizeRequest: allow
    });
    for (let index = 0; index < 40; index += 1) await right.send(request(`r${index}`, manifest.contentHash));
    await expect(peer.closed).resolves.toBeInstanceOf(RangeError);
    expect(left.closed).toBe(true);
  });

  it('畸形帧结束会话：关闭底层传输，并经 closed 报告原因', async () => {
    const manifest = await fileOf(new Uint8Array([1, 2, 3]), 3);
    const [left, right] = linkedTransports();
    const peer = createP2PTransportPeer(left, 'local', manifest, rangeReader(new Uint8Array([1, 2, 3])), {});
    await right.send(new TextEncoder().encode('garbage'));
    await expect(peer.closed).resolves.toBeInstanceOf(RangeError);
    expect(left.closed).toBe(true);
    await expect(
      peer.source.requestChunk({ contentHash: manifest.contentHash, offset: 0, size: 3 }, new AbortController().signal)
    ).rejects.toThrow('closed');
  });

  it('底层 send 一直挂起时请求仍可取消，关闭会话也不留下未处理的拒绝', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left] = linkedTransports();
    left.sendGate = new Promise<void>(() => undefined);
    const peer = createP2PTransportPeer(left, 'stalled', manifest, rangeReader(bytes), {});
    const controller = new AbortController();
    const pending = peer.source.requestChunk(
      { contentHash: manifest.contentHash, offset: 0, size: 3 },
      controller.signal
    );
    controller.abort(new Error('request timed out'));
    await expect(pending).rejects.toThrow('request timed out');
    const another = peer.source.requestChunk(
      { contentHash: manifest.contentHash, offset: 0, size: 3 },
      new AbortController().signal
    );
    await peer.close();
    await expect(another).rejects.toThrow('closed');
    await tick();
  });

  it('发送请求失败时清理 pending，关闭会话不留未处理 promise', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const transport = new LinkedTransport();
    transport.failSend = true;
    const peer = createP2PTransportPeer(transport, 'local', manifest, rangeReader(bytes), {});
    await expect(
      peer.source.requestChunk({ contentHash: manifest.contentHash, offset: 0, size: 3 }, new AbortController().signal)
    ).rejects.toThrow('send failed');
    await peer.close();
    await expect(peer.closed).resolves.toBeInstanceOf(Error);
  });

  it('本端并发超过协议上限的请求时排队等名额，不会触发对端的未完成请求上限', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const requester = createP2PTransportPeer(left, 'holder', manifest, rangeReader(bytes), {});
    const holder = createP2PTransportPeer(
      right,
      'requester',
      manifest,
      async () => {
        await gate;
        return bytes;
      },
      { authorizeRequest: allow }
    );
    const chunk = { contentHash: manifest.contentHash, offset: 0, size: 3 };
    const requests = Array.from({ length: 40 }, () =>
      requester.source.requestChunk(chunk, new AbortController().signal)
    );
    await delay(5);
    release();
    await expect(Promise.all(requests)).resolves.toHaveLength(40);
    expect(await isSettled(holder.closed)).toBe(false);
    await requester.close();
    await holder.close();
  });

  it('没有认证钩子的一端不供块', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    const requester = createP2PTransportPeer(left, 'holder', manifest, rangeReader(bytes), {});
    const unguarded = createP2PTransportPeer(right, 'requester', manifest, rangeReader(bytes), {});
    await expect(
      requester.source.requestChunk(
        { contentHash: manifest.contentHash, offset: 0, size: 3 },
        new AbortController().signal
      )
    ).rejects.toThrow('authorization is required');
    await requester.close();
    await unguarded.close();
  });

  it('响应发不出去时结束会话，经 closed 报告原因', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await fileOf(bytes, 3);
    const [left, right] = linkedTransports();
    const holder = createP2PTransportPeer(left, 'requester', manifest, rangeReader(bytes), { authorizeRequest: allow });
    left.failSend = true;
    await right.send(request('r1', manifest.contentHash));
    await expect(holder.closed).resolves.toHaveProperty('message', 'send failed');
    expect(left.closed).toBe(true);
  });

  it('拒绝越界的入站并发、消息上限与超过协议最大帧的发送', async () => {
    const manifest = await fileOf(new Uint8Array([1, 2, 3]), 3);
    for (const maxInboundRequests of [0, 33, 1.5]) {
      expect(() =>
        createP2PTransportPeer(new LinkedTransport(), 'peer', manifest, rangeReader(new Uint8Array(3)), {
          maxInboundRequests
        })
      ).toThrow(RangeError);
    }
    expect(() => createWebRTCTransport(new FakeChannel(), { maxMessageSize: 1 })).toThrow(RangeError);
    const transport = createTcpTransport(new FakeSocket());
    await expect(transport.send(new Uint8Array(2 * 1024 * 1024))).rejects.toThrow('too large');
    transport.close();
    const notAnObject = Uint8Array.from([...frameHeader(1), ...new TextEncoder().encode('7')]);
    expect(() => decodeP2PFrame(notAnObject)).toThrow('metadata is invalid');
  });

  it('经 WebRTC 传输超过单条消息上限的大块：分片传输，会话不被拆掉', async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 }, (_, index) => (index * 13) % 256);
    const manifest = await fileOf(bytes, 512 * 1024);
    const [leftChannel, rightChannel] = linkedChannels();
    const requester = createP2PTransportPeer(
      createWebRTCTransport(leftChannel),
      'holder',
      manifest,
      rangeReader(bytes),
      {}
    );
    const holder = createP2PTransportPeer(
      createWebRTCTransport(rightChannel),
      'requester',
      manifest,
      rangeReader(bytes),
      {
        authorizeRequest: allow
      }
    );
    await expect(
      transferP2PFile({ manifest, sources: [requester.source], writeChunk: async () => undefined })
    ).resolves.toMatchObject({ completedChunks: 2 });
    expect([...leftChannel.sent, ...rightChannel.sent].every(message => message.byteLength <= 65536)).toBe(true);
    await requester.close();
    await holder.close();
  });
});
