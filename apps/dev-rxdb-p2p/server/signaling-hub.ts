/**
 * 信令中枢：认证、在线状态、建连与转发，不依赖 Durable Object 运行时。
 *
 * @remarks
 * 状态全部挂在连接上（休眠附件），中枢本身不持有会在休眠时丢失的内存表：在线设备由
 * `sockets()` 现取，`signal` 按实例键直接寻址。任何已认证的设备都能向别的设备发起连接；
 * 连接票据只发给对应的那一端，冒名者拿不到对方的票，过不了会话的 hello 认证。
 */
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type SignalingErrorCode,
  type SignalingPeer
} from '../shared/signaling-protocol';

/** 未认证或认证失败。 */
export const CLOSE_UNAUTHORIZED = 4401;
/** 同一实例重连，旧连接被替换。 */
export const CLOSE_REPLACED = 4409;
/** 管理员把设备踢下线：客户端按凭据被拒处理，不自动重连。 */
export const CLOSE_EVICTED = 4403;
/** 认证宿主不可达。 */
export const CLOSE_SERVER_ERROR = 1011;

/** 中枢看到的一条连接。 */
export interface HubSocket {
  send(message: string): void;
  close(code: number, reason: string): void;
  /** 连接仍处于 OPEN：运行时在关闭回调期间还会列出正在关闭的连接，不能算在线。 */
  open(): boolean;
  /** 认证通过的设备；未认证时为 null。 */
  peer(): SignalingPeer | null;
  attach(peer: SignalingPeer): void;
  detach(): void;
}

/** 认证消息。 */
export type HelloMessage = Extract<ClientMessage, { type: 'hello' }>;
type SignalMessage = Extract<ClientMessage, { type: 'signal' }>;

/** 中枢的外部依赖。 */
export interface SignalingHubOptions {
  /** 当前全部连接，含尚未认证的。 */
  readonly sockets: () => readonly HubSocket[];
  /** 校验 hello：返回认证通过的设备；凭据无效时为 null；认证宿主故障时抛错。 */
  readonly authenticate: (hello: HelloMessage) => Promise<SignalingPeer | null>;
  /** 为一条连接的发起方与响应方各签一张票。 */
  readonly issueTickets: (
    connectionId: string,
    initiator: SignalingPeer,
    responder: SignalingPeer
  ) => Promise<readonly [string, string]>;
  /** 验票公钥，随 `welcome` 下发。 */
  readonly ticketKey: JsonWebKey;
  /** 生成连接标识。 */
  readonly newConnectionId: () => string;
}

const send = (socket: HubSocket, message: ServerMessage): void => socket.send(JSON.stringify(message));

const fail = (socket: HubSocket, code: SignalingErrorCode, message: string): void =>
  send(socket, { type: 'error', code, message });

/** 信令中枢。 */
export class SignalingHub {
  readonly #options: SignalingHubOptions;

  constructor(options: SignalingHubOptions) {
    this.#options = options;
  }

  /** 处理一条连接发来的消息。 */
  async receive(socket: HubSocket, raw: string): Promise<void> {
    const message = parseClientMessage(raw);
    const self = socket.peer();
    if (!self) return this.#greet(socket, message);
    if (message?.type === 'connect') return this.#connect(socket, self, message.to);
    if (message?.type === 'signal') return this.#relay(socket, self, message);
    fail(socket, 'bad_request', 'expected connect or signal');
  }

  /** 一条连接断开：它认证过才通知其余在线设备。 */
  left(socket: HubSocket): void {
    if (!socket.peer()) return;
    socket.detach();
    this.#publishPresence(this.#members());
  }

  /** 当前在线的设备：已认证且连接仍开着。 */
  roster(): readonly SignalingPeer[] {
    return this.#members().map(peerOf);
  }

  /**
   * 断开满足条件的在线设备，并把剩下的在线设备告知其余各端。
   *
   * @remarks
   * 与 {@link SignalingHub.left} 一样先解除附件：运行时随后回调的关闭事件认不出这条连接，不会重复通知。
   *
   * @returns 被断开的连接数
   */
  evict(match: (peer: SignalingPeer) => boolean, reason: string): number {
    const evicted = this.#members().filter(socket => match(peerOf(socket)));
    for (const socket of evicted) {
      socket.detach();
      socket.close(CLOSE_EVICTED, reason);
    }
    if (evicted.length > 0) this.#publishPresence(this.#members());
    return evicted.length;
  }

  async #greet(socket: HubSocket, message: ClientMessage | null): Promise<void> {
    if (message?.type !== 'hello') return this.#reject(socket, 'hello is required first');
    let peer: SignalingPeer | null;
    try {
      peer = await this.#options.authenticate(message);
    } catch (error) {
      fail(socket, 'server_error', error instanceof Error ? error.message : String(error));
      return socket.close(CLOSE_SERVER_ERROR, 'authentication host unavailable');
    }
    if (!peer) return this.#reject(socket, 'invalid access token or device');
    this.#replaceStale(socket, peer.key);
    socket.attach(peer);
    const others = this.#members().filter(member => member !== socket);
    send(socket, { type: 'welcome', self: peer, peers: others.map(peerOf), ticketKey: this.#options.ticketKey });
    this.#publishPresence(this.#members(), others);
  }

  #reject(socket: HubSocket, reason: string): void {
    fail(socket, 'unauthorized', reason);
    socket.close(CLOSE_UNAUTHORIZED, 'unauthorized');
  }

  #replaceStale(socket: HubSocket, key: string): void {
    for (const stale of this.#members().filter(member => member !== socket && peerOf(member).key === key)) {
      stale.detach();
      stale.close(CLOSE_REPLACED, 'replaced by a newer connection');
    }
  }

  async #connect(socket: HubSocket, self: SignalingPeer, to: string): Promise<void> {
    const target = this.#find(socket, to);
    if (!target) return fail(socket, 'peer_unavailable', `${to} is not online`);
    const peer = peerOf(target);
    const connectionId = this.#options.newConnectionId();
    const [initiatorTicket, responderTicket] = await this.#options.issueTickets(connectionId, self, peer);
    send(socket, { type: 'connection', connectionId, role: 'initiator', peer, ticket: initiatorTicket });
    send(target, { type: 'connection', connectionId, role: 'responder', peer: self, ticket: responderTicket });
  }

  #relay(socket: HubSocket, self: SignalingPeer, message: SignalMessage): void {
    const target = this.#find(socket, message.to);
    if (!target) return fail(socket, 'peer_unavailable', `${message.to} is not online`);
    const { connectionId, kind, payload } = message;
    send(target, { type: 'signal', from: self.key, connectionId, kind, payload });
  }

  #find(socket: HubSocket, key: string): HubSocket | undefined {
    return this.#members().find(member => member !== socket && peerOf(member).key === key);
  }

  #members(): HubSocket[] {
    return this.#options.sockets().filter(socket => socket.open() && socket.peer() !== null);
  }

  #publishPresence(roster: readonly HubSocket[], recipients: readonly HubSocket[] = roster): void {
    for (const recipient of recipients) {
      const peers = roster.filter(member => member !== recipient).map(peerOf);
      send(recipient, { type: 'presence', peers });
    }
  }
}

const peerOf = (socket: HubSocket): SignalingPeer => socket.peer() as SignalingPeer;
