/**
 * 对端连接：信令服务分配的每条连接对应一个 RTCPeerConnection、一条 DataChannel、一个 P2P 会话。
 *
 * @remarks
 * - 发起方建 DataChannel 与 offer，响应方在 `datachannel` 事件里接住通道；SDP / ICE 经信令逐条转发（trickle ICE），
 *   每条连接的信令按到达顺序串行处理，远端描述就位之前到的 ICE 先缓存。
 * - 只接受信令服务为这条连接宣布的那个对端发来的信令；会话 hello 的凭据按 {@link authenticatePeerTicket} 校验。
 * - 已就绪的会话登记进 `P2PSessionRegistry`，同一对端只留一条（双方同时拨号时按包里的规则去重）。
 * - 不配 STUN / TURN：只走局域网直连（epic-011 非目标）。
 */
import {
  createWebRTCTransport,
  openP2PSession,
  P2PSessionRegistry,
  type P2PPeerIdentity,
  type P2PPeerSession,
  type P2PProtocol,
  type P2PSessionCloseCode,
  type P2PSessionRole,
  type P2PSessionState
} from '@aiao/rxdb-plugin-p2p';
import { BehaviorSubject, type Subscription } from 'rxjs';
import { importTicketVerifyKey } from '../../../shared/connection-ticket';
import type { SignalingPeer, SignalKind } from '../../../shared/signaling-protocol';
import { FrameTrace, type FrameTotals, type TracedFrame } from './frame-trace';
import { authenticatePeerTicket } from './peer-auth';
import type { ConnectionOffer, IncomingSignal, SignalingClient } from './signaling-client';

/** 页面上的一条连接。 */
export interface LinkView {
  readonly connectionId: string;
  readonly peer: SignalingPeer;
  readonly role: P2PSessionRole;
  readonly state: P2PSessionState;
  /** 会话结束原因；未结束时为 null。 */
  readonly closeCode: P2PSessionCloseCode | null;
  /** 两端都声明、版本相同的协议。 */
  readonly protocols: readonly string[];
  readonly totals: FrameTotals;
  readonly frames: readonly TracedFrame[];
}

/** 连接参数。 */
export interface PeerLinksOptions {
  readonly signaling: SignalingClient;
  readonly local: P2PPeerIdentity;
  /** 本端声明的协议；每条新会话取一次。 */
  readonly protocols: () => readonly P2PProtocol[];
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
  /** 请求建连后等信令服务分配连接的上限。 */
  readonly connectTimeoutMs: number;
  readonly createPeerConnection: () => RTCPeerConnection;
}

interface Link {
  readonly offer: ConnectionOffer;
  readonly pc: RTCPeerConnection;
  readonly trace: FrameTrace;
  readonly session: Promise<P2PPeerSession>;
  readonly pendingIce: RTCIceCandidateInit[];
  current: P2PPeerSession | null;
  registered: Promise<P2PPeerSession> | null;
  closeCode: P2PSessionCloseCode | null;
  signals: Promise<void>;
}

const FRAME_HISTORY = 60;
const VIEW_LIMIT = 20;
const EMIT_INTERVAL_MS = 200;

/** 对端连接。 */
export class PeerLinks {
  readonly #options: PeerLinksOptions;
  readonly #links = new Map<string, Link>();
  readonly #settlers = new Map<string, (session: P2PPeerSession) => void>();
  readonly #waiting = new Map<string, (offer: ConnectionOffer) => void>();
  #subscriptions: Subscription[] = [];
  #verifyKey: { readonly x: string | undefined; readonly key: Promise<CryptoKey> } | null = null;
  #emitTimer: ReturnType<typeof setTimeout> | undefined;
  readonly links$ = new BehaviorSubject<readonly LinkView[]>([]);
  readonly registry = new P2PSessionRegistry();

  constructor(options: PeerLinksOptions) {
    this.#options = options;
  }

  /** 开始接收信令服务分配的连接与转发的信令。 */
  start(): void {
    this.#subscriptions = [
      this.#options.signaling.connections$.subscribe(offer => this.#accept(offer)),
      this.#options.signaling.signals$.subscribe(signal => this.#queueSignal(signal))
    ];
  }

  /** 关闭全部会话与连接。 */
  async stop(): Promise<void> {
    for (const subscription of this.#subscriptions) subscription.unsubscribe();
    await this.registry.close();
    for (const link of this.#links.values()) link.pc.close();
  }

  /** 与某台在线设备已就绪的会话。 */
  sessionWith(peerKey: string): P2PPeerSession | undefined {
    return this.registry.sessions.find(session => session.state === 'ready' && session.peer?.instanceId === peerKey);
  }

  /**
   * 取得与某台在线设备的会话，没有就经信令新建一条并等它就绪。
   *
   * @throws SignalingOfflineError 信令不可达
   * @throws P2PSessionClosedError 会话在就绪前结束（例如凭据被拒）
   */
  async connect(peerKey: string): Promise<P2PPeerSession> {
    const existing = this.sessionWith(peerKey);
    if (existing) return existing;
    this.#options.signaling.requestConnection(peerKey);
    const offer = await this.#awaitOffer(peerKey);
    const link = this.#links.get(offer.connectionId) as Link;
    await link.session;
    return link.registered as Promise<P2PPeerSession>;
  }

  /** 结束一条连接的会话。 */
  disconnect(connectionId: string): void {
    void this.#links.get(connectionId)?.current?.close();
  }

  #awaitOffer(peerKey: string): Promise<ConnectionOffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(peerKey);
        reject(new Error(`signaling did not set up a connection to ${peerKey}`));
      }, this.#options.connectTimeoutMs);
      this.#waiting.set(peerKey, offer => {
        clearTimeout(timer);
        resolve(offer);
      });
    });
  }

  #accept(offer: ConnectionOffer): void {
    const link = this.#createLink(offer);
    this.#links.set(offer.connectionId, link);
    if (offer.role === 'responder') {
      link.pc.addEventListener('datachannel', event => this.#settle(link, this.#open(link, event.channel)), { once: true });
    } else {
      this.#startInitiator(link).catch((error: unknown) => this.#fail(link, error));
      this.#waiting.get(offer.peer.key)?.(offer);
      this.#waiting.delete(offer.peer.key);
    }
    this.#emitSoon();
  }

  #createLink(offer: ConnectionOffer): Link {
    const pc = this.#options.createPeerConnection();
    const session = new Promise<P2PPeerSession>(resolve => this.#settlers.set(offer.connectionId, resolve));
    const link: Link = {
      offer,
      pc,
      trace: new FrameTrace(FRAME_HISTORY, () => this.#emitSoon()),
      session,
      pendingIce: [],
      current: null,
      registered: null,
      closeCode: null,
      signals: Promise.resolve()
    };
    pc.addEventListener('icecandidate', event => {
      if (event.candidate) this.#signal(link, 'ice', JSON.stringify(event.candidate.toJSON()));
    });
    return link;
  }

  async #startInitiator(link: Link): Promise<void> {
    this.#settle(link, this.#open(link, link.pc.createDataChannel('p2p', { ordered: true })));
    await link.pc.setLocalDescription(await link.pc.createOffer());
    this.#signal(link, 'offer', JSON.stringify(link.pc.localDescription));
  }

  #open(link: Link, channel: RTCDataChannel): P2PPeerSession {
    const { offer } = link;
    return openP2PSession({
      transport: link.trace.wrap(createWebRTCTransport(channel)),
      role: offer.role,
      connectionId: offer.connectionId,
      local: this.#options.local,
      credential: offer.ticket,
      authenticate: async (credential, context) =>
        authenticatePeerTicket(credential, context, offer.peer, await this.#ticketKey(), Date.now()),
      protocols: this.#options.protocols(),
      heartbeatIntervalMs: this.#options.heartbeatIntervalMs,
      heartbeatTimeoutMs: this.#options.heartbeatTimeoutMs
    });
  }

  #settle(link: Link, session: P2PPeerSession): void {
    link.current = session;
    link.registered = this.registry.add(session);
    link.registered.catch(() => undefined);
    void session.ready.then(
      () => this.#emitSoon(),
      () => undefined
    );
    void session.closed.then(reason => {
      link.closeCode = reason.code;
      link.pc.close();
      this.#emitSoon();
    });
    this.#settlers.get(link.offer.connectionId)?.(session);
    this.#settlers.delete(link.offer.connectionId);
  }

  #queueSignal(signal: IncomingSignal): void {
    const link = this.#links.get(signal.connectionId);
    if (!link || signal.from !== link.offer.peer.key) return;
    link.signals = link.signals.then(() => this.#applySignal(link, signal)).catch((error: unknown) => this.#fail(link, error));
  }

  async #applySignal(link: Link, signal: IncomingSignal): Promise<void> {
    if (signal.kind === 'ice') return this.#addIce(link, JSON.parse(signal.payload) as RTCIceCandidateInit);
    await link.pc.setRemoteDescription(JSON.parse(signal.payload) as RTCSessionDescriptionInit);
    for (const candidate of link.pendingIce.splice(0)) await link.pc.addIceCandidate(candidate);
    if (signal.kind === 'answer') return;
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    this.#signal(link, 'answer', JSON.stringify(link.pc.localDescription));
  }

  async #addIce(link: Link, candidate: RTCIceCandidateInit): Promise<void> {
    if (!link.pc.remoteDescription) {
      link.pendingIce.push(candidate);
      return;
    }
    await link.pc.addIceCandidate(candidate);
  }

  #signal(link: Link, kind: SignalKind, payload: string): void {
    try {
      this.#options.signaling.sendSignal(link.offer.peer.key, link.offer.connectionId, kind, payload);
    } catch (error) {
      this.#fail(link, error);
    }
  }

  /** 握手失败：关掉连接，会话随之以 transport_failed 或 hello 超时结束，原因显示在连接上。 */
  #fail(link: Link, error: unknown): void {
    console.error(`[p2p] connection ${link.offer.connectionId} failed`, error);
    link.pc.close();
    void link.current?.close();
    this.#emitSoon();
  }

  /** 验票公钥：信令重连后若换了密钥（重新部署），按新公钥重新导入。 */
  #ticketKey(): Promise<CryptoKey> {
    const jwk = this.#options.signaling.ticketKey;
    if (!jwk) return Promise.reject(new Error('signaling has not published a ticket key yet'));
    const known = this.#verifyKey;
    const cached = known && known.x === jwk.x ? known : { x: jwk.x, key: importTicketVerifyKey(jwk) };
    this.#verifyKey = cached;
    return cached.key;
  }

  #emitSoon(): void {
    if (this.#emitTimer !== undefined) return;
    this.#emitTimer = setTimeout(() => {
      this.#emitTimer = undefined;
      this.links$.next(this.#snapshot());
    }, EMIT_INTERVAL_MS);
  }

  #snapshot(): LinkView[] {
    const names = this.#options.protocols().map(protocol => protocol.name);
    return [...this.#links.values()]
      .reverse()
      .slice(0, VIEW_LIMIT)
      .map(link => ({
        connectionId: link.offer.connectionId,
        peer: link.offer.peer,
        role: link.offer.role,
        state: link.current?.state ?? 'connecting',
        closeCode: link.closeCode,
        protocols: names.filter(name => link.current?.supports(name)),
        totals: link.trace.totals(),
        frames: link.trace.recent()
      }));
  }
}
