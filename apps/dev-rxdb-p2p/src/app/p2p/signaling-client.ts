/**
 * 信令客户端：连上 Worker 的信令 Durable Object，维护在线设备，收发建连与 SDP / ICE。
 *
 * @remarks
 * 每次（重）连都取一份新的 access token。断线后按固定间隔重连；服务端以 4401（凭据被拒）或 4403（被管理员踢下线）
 * 关闭时不再重连：这两种情况自己重连只会再被拒绝或再被踢。
 * 信令不可达时发起新连接直接抛 {@link SignalingOfflineError}：浏览器新建 P2P 连接以信令可达为前置，
 * 已经建好的会话不受影响（US-704 / US-707 AC#6）。
 */
import { BehaviorSubject, Subject } from 'rxjs';
import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type SignalingErrorCode,
  type SignalingPeer,
  type SignalKind
} from '../../../shared/signaling-protocol';

/** 信令连接状态；`rejected` 表示凭据被拒或被管理员踢下线，不会自动重连。 */
export type SignalingState = 'connecting' | 'online' | 'offline' | 'rejected';
/** 服务端分配的一条新连接。 */
export type ConnectionOffer = Extract<ServerMessage, { type: 'connection' }>;
/** 对端转发来的 SDP / ICE。 */
export type IncomingSignal = Extract<ServerMessage, { type: 'signal' }>;

/** hello 需要的凭据。 */
export interface SignalingCredentials {
  readonly accessToken: string;
  readonly deviceId: string;
  readonly instanceId: string;
}

/** 客户端参数。 */
export interface SignalingClientOptions {
  /** `ws(s)://<host>/api/signal`。 */
  readonly url: string;
  /** 每次（重）连时取凭据。 */
  readonly credentials: () => Promise<SignalingCredentials>;
  readonly createSocket: (url: string) => WebSocket;
  readonly reconnectDelayMs: number;
}

/** 信令不可达时发起新连接。 */
export class SignalingOfflineError extends Error {
  constructor() {
    super('signaling is unreachable: a new peer connection needs the signaling server');
    this.name = 'SignalingOfflineError';
  }
}

/** 服务端的关闭码：凭据被拒（4401）、被管理员踢下线（4403）；见 server/signaling-hub.ts。 */
const REJECTED_CLOSE_CODES: ReadonlySet<number> = new Set([4401, 4403]);

/** 信令客户端。 */
export class SignalingClient {
  readonly #options: SignalingClientOptions;
  #socket: WebSocket | null = null;
  #ticketKey: JsonWebKey | null = null;
  #stopped = true;
  #retry: ReturnType<typeof setTimeout> | undefined;
  readonly state$ = new BehaviorSubject<SignalingState>('offline');
  readonly self$ = new BehaviorSubject<SignalingPeer | null>(null);
  readonly peers$ = new BehaviorSubject<readonly SignalingPeer[]>([]);
  readonly connections$ = new Subject<ConnectionOffer>();
  readonly signals$ = new Subject<IncomingSignal>();
  readonly errors$ = new Subject<{ readonly code: SignalingErrorCode; readonly message: string }>();

  /** 信令服务公布的验票公钥；还没收到 welcome 时为 null。 */
  get ticketKey(): JsonWebKey | null {
    return this.#ticketKey;
  }

  constructor(options: SignalingClientOptions) {
    this.#options = options;
  }

  /** 开始连接，断线自动重连。 */
  start(): void {
    this.#stopped = false;
    void this.#open();
  }

  /** 断开且不再重连。 */
  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#retry);
    this.#socket?.close(1000, 'bye');
    this.#socket = null;
    this.state$.next('offline');
  }

  /**
   * 请服务端为本端与 `to` 建一条连接。
   *
   * @throws SignalingOfflineError 信令不可达
   */
  requestConnection(to: string): void {
    this.#send({ type: 'connect', to });
  }

  /**
   * 转发 SDP / ICE。
   *
   * @throws SignalingOfflineError 信令不可达
   */
  sendSignal(to: string, connectionId: string, kind: SignalKind, payload: string): void {
    this.#send({ type: 'signal', to, connectionId, kind, payload });
  }

  async #open(): Promise<void> {
    this.state$.next('connecting');
    const credentials = await this.#options.credentials();
    if (this.#stopped) return;
    const socket = this.#options.createSocket(this.#options.url);
    this.#socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', ...credentials } satisfies ClientMessage));
    socket.onmessage = event => this.#receive(String(event.data));
    socket.onclose = event => this.#closed(socket, event.code);
  }

  #receive(raw: string): void {
    const message = parseServerMessage(raw);
    if (message) this.#dispatch(message);
  }

  #dispatch(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.#ticketKey = message.ticketKey;
        this.self$.next(message.self);
        this.peers$.next(message.peers);
        return this.state$.next('online');
      case 'presence':
        return this.peers$.next(message.peers);
      case 'connection':
        return this.connections$.next(message);
      case 'signal':
        return this.signals$.next(message);
      case 'error':
        return this.errors$.next({ code: message.code, message: message.message });
    }
  }

  #closed(socket: WebSocket, code: number): void {
    if (socket !== this.#socket) return;
    this.#socket = null;
    this.peers$.next([]);
    const rejected = REJECTED_CLOSE_CODES.has(code);
    this.state$.next(rejected ? 'rejected' : 'offline');
    if (this.#stopped || rejected) return;
    this.#retry = setTimeout(() => void this.#open(), this.#options.reconnectDelayMs);
  }

  #send(message: ClientMessage): void {
    if (this.state$.value !== 'online' || !this.#socket) throw new SignalingOfflineError();
    this.#socket.send(JSON.stringify(message));
  }
}
