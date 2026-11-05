/**
 * 信令 Durable Object：用休眠 WebSocket 接住每台设备的连接，消息交给 {@link SignalingHub}。
 *
 * @remarks
 * 认证通过的设备写进连接附件，休眠唤醒后仍在；中枢每次现取 `getWebSockets()`，不持有内存表。
 * compatibility date 不早于 2026-04-07，运行时自动应答关闭帧，`webSocketClose` 里不必再调 `close()`。
 */
import type { SignalingPeer } from '../shared/signaling-protocol';
import {
  matchesEvictTarget,
  parseEvictTarget,
  ROOM_ADMIN_EVICT,
  ROOM_ADMIN_ONLINE,
  ROOM_ADMIN_PREFIX
} from './admin-room';
import { supabaseConfigOf, type Env } from './env';
import { json, methodNotAllowed } from './http';
import { findOwnDevice, verifyAccessToken } from './identity';
import {
  createWebSocketPair,
  upgradeResponse,
  type DurableObjectStateLike,
  type HibernatableWebSocket
} from './runtime';
import { SignalingHub, type HelloMessage, type HubSocket } from './signaling-hub';
import { createTicketIssuer } from './tickets';

const EVICT_REASON = 'removed by an administrator';

const hubSocketOf = (socket: HibernatableWebSocket): HubSocket => ({
  send: message => socket.send(message),
  close: (code, reason) => socket.close(code, reason),
  open: () => socket.readyState === WebSocket.OPEN,
  peer: () => socket.deserializeAttachment() as SignalingPeer | null,
  attach: peer => socket.serializeAttachment(peer),
  detach: () => socket.serializeAttachment(null)
});

/** 信令房间。 */
export class SignalingRoom {
  readonly #ctx: DurableObjectStateLike;
  readonly #env: Env;
  readonly #sockets = new WeakMap<WebSocket, HubSocket>();
  #hub: Promise<SignalingHub> | undefined;

  constructor(ctx: DurableObjectStateLike, env: Env) {
    this.#ctx = ctx;
    this.#env = env;
  }

  /**
   * 接受 WebSocket 升级；`/admin/*` 是 Worker 在验过管理员后发来的内部请求（在线列表、踢下线）。
   *
   * @throws Error 签票私钥配置有误：在升级之前抛出，客户端拿到 500，而不是连上之后没有任何应答
   */
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(ROOM_ADMIN_PREFIX)) return this.#administer(request, pathname);
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    await this.#hubReady();
    const [client, server] = createWebSocketPair();
    this.#ctx.acceptWebSocket(server);
    return upgradeResponse(client);
  }

  /** 休眠 API：收到一条消息。 */
  async webSocketMessage(socket: HibernatableWebSocket, message: string | ArrayBuffer): Promise<void> {
    const hub = await this.#hubReady();
    await hub.receive(this.#wrap(socket), typeof message === 'string' ? message : '');
  }

  /** 休眠 API：连接关闭。 */
  async webSocketClose(socket: HibernatableWebSocket): Promise<void> {
    (await this.#hubReady()).left(this.#wrap(socket));
  }

  /** 休眠 API：连接出错。 */
  async webSocketError(socket: HibernatableWebSocket): Promise<void> {
    (await this.#hubReady()).left(this.#wrap(socket));
  }

  async #administer(request: Request, pathname: string): Promise<Response> {
    const hub = await this.#hubReady();
    if (pathname === ROOM_ADMIN_ONLINE) {
      return request.method === 'GET' ? json(200, { peers: hub.roster() }) : methodNotAllowed('GET');
    }
    if (pathname === ROOM_ADMIN_EVICT) {
      return request.method === 'POST' ? this.#evict(hub, request) : methodNotAllowed('POST');
    }
    return json(404, { error: 'not found' });
  }

  async #evict(hub: SignalingHub, request: Request): Promise<Response> {
    const target = parseEvictTarget(await request.json().catch(() => null));
    if (!target) return json(400, { error: 'expected exactly one of userId or deviceId' });
    return json(200, { evicted: hub.evict(peer => matchesEvictTarget(peer, target), EVICT_REASON) });
  }

  #wrap(socket: HibernatableWebSocket): HubSocket {
    const known = this.#sockets.get(socket);
    if (known) return known;
    const wrapped = hubSocketOf(socket);
    this.#sockets.set(socket, wrapped);
    return wrapped;
  }

  #hubReady(): Promise<SignalingHub> {
    this.#hub ??= this.#createHub();
    return this.#hub;
  }

  async #createHub(): Promise<SignalingHub> {
    const issuer = await createTicketIssuer(this.#env.TICKET_PRIVATE_JWK, () => Date.now());
    return new SignalingHub({
      sockets: () => this.#ctx.getWebSockets().map(socket => this.#wrap(socket)),
      authenticate: hello => this.#authenticate(hello),
      issueTickets: (connectionId, initiator, responder) => issuer.issue(connectionId, initiator, responder),
      ticketKey: issuer.publicKey,
      newConnectionId: () => crypto.randomUUID()
    });
  }

  async #authenticate(hello: HelloMessage): Promise<SignalingPeer | null> {
    const config = supabaseConfigOf(this.#env);
    const user = await verifyAccessToken(config, hello.accessToken);
    if (!user) return null;
    const device = await findOwnDevice(config, hello.accessToken, hello.deviceId);
    if (!device) return null;
    return {
      key: hello.instanceId,
      principal: user.id,
      userName: user.email,
      deviceId: device.id,
      deviceName: device.name
    };
  }
}
