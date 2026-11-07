/** 会话层与 files 协议测试共用的内存通道、身份与会话夹具；不进构建产物。 */
import type { P2PByteTransport } from '../session/frame.js';
import type { P2PPeerIdentity, P2PPrincipal } from '../session/identity.js';
import { openP2PSession, type P2PPeerSession, type P2PSessionOptions } from '../session/session.js';
import type { P2PTcpSocketLike } from '../session/tcp-transport.js';
import type { P2PDataChannelLike } from '../session/webrtc-transport.js';

type Listener = (event: Event) => void;
/** 监听器参数按逆变比较：`never` 让各个事件签名都能登记进同一张表，派发时再按 unknown 调用。 */
type SocketListener = (value: never) => void;

export const delay = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));
export const tick = (): Promise<void> => delay(0);

/** 等一轮宏任务后判断 promise 是否已经落定。 */
export const isSettled = async (promise: Promise<unknown>): Promise<boolean> => {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  await tick();
  return settled;
};

/**
 * 两段字节逐字节相同。上百 KiB 的断言用它代替 `toEqual`：后者逐元素递归比较，
 * 1 MiB 带覆盖率要两秒左右，CI 上会把用例拖过 5 秒超时。
 */
export const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

/** 一条完整帧放在单个末片里：1 字节分片头（1 = 末片）+ 负载。 */
export const lastFragment = (...bytes: number[]): Uint8Array => Uint8Array.from([1, ...bytes]);

/** 4 字节大端长度前缀。 */
export const frameHeader = (size: number): Uint8Array => {
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, size);
  return header;
};

export class FakeChannel implements P2PDataChannelLike {
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

export const linkedChannels = (): [FakeChannel, FakeChannel] => {
  const left = new FakeChannel();
  const right = new FakeChannel();
  left.peer = right;
  right.peer = left;
  return [left, right];
};

export class FakeSocket implements P2PTcpSocketLike {
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

/** 内存里的一对帧通道：一端发出的帧原样投递到另一端。 */
export class LinkedTransport implements P2PByteTransport {
  peer?: LinkedTransport;
  closed = false;
  failSend = false;
  sendGate?: Promise<void>;
  readonly queue: Uint8Array[] = [];
  readonly sentFrames: Uint8Array[] = [];
  readonly waiters: Array<{ resolve: (frame: Uint8Array) => void; reject: (error: Error) => void }> = [];

  async send(frame: Uint8Array): Promise<void> {
    if (this.failSend) throw new Error('send failed');
    if (this.closed) throw new Error('closed');
    await this.sendGate;
    this.sentFrames.push(frame);
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

export const linkedTransports = (): [LinkedTransport, LinkedTransport] => {
  const left = new LinkedTransport();
  const right = new LinkedTransport();
  left.peer = right;
  right.peer = left;
  return [left, right];
};

export const alice: P2PPeerIdentity = {
  principal: { principal: 'alice', deviceId: 'laptop' },
  instanceId: 'alice-laptop-tab-1'
};

export const bob: P2PPeerIdentity = {
  principal: { principal: 'bob', deviceId: 'desktop' },
  instanceId: 'bob-desktop-app-1'
};

/** 认证宿主签发的凭据：绑定连接与身份，重放到别的连接即失效。 */
export const credentialFor = (identity: P2PPeerIdentity, connectionId: string): string =>
  ['token', connectionId, identity.principal.principal, identity.principal.deviceId].join(':');

/** 与 {@link credentialFor} 配套的认证宿主校验：连接不对即拒绝。 */
export const verifyCredential = (
  credential: string,
  context: { readonly connectionId: string }
): P2PPrincipal | null => {
  const [scheme, connectionId, principal, deviceId] = credential.split(':');
  return scheme === 'token' && connectionId === context.connectionId ? { principal, deviceId } : null;
};

/** 一端的会话选项：缺省走 {@link verifyCredential}，凭据绑定到 `connectionId`。 */
export const sessionOptions = (
  transport: P2PByteTransport,
  local: P2PPeerIdentity,
  overrides: Partial<P2PSessionOptions> = {}
): P2PSessionOptions => {
  const connectionId = overrides.connectionId ?? 'c1';
  return {
    transport,
    role: 'initiator',
    connectionId,
    local,
    credential: credentialFor(local, connectionId),
    authenticate: verifyCredential,
    protocols: [],
    ...overrides
  };
};

/** 在一对内存通道上打开 alice（发起方）与 bob（响应方）的会话。 */
export const openSessionPair = (
  options: {
    readonly left?: Partial<P2PSessionOptions>;
    readonly right?: Partial<P2PSessionOptions>;
    readonly transports?: readonly [P2PByteTransport, P2PByteTransport];
  } = {}
): [P2PPeerSession, P2PPeerSession] => {
  const [left, right] = options.transports ?? linkedTransports();
  return [
    openP2PSession(sessionOptions(left, alice, { role: 'initiator', ...options.left })),
    openP2PSession(sessionOptions(right, bob, { role: 'responder', ...options.right }))
  ];
};
