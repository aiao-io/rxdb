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
import { UpgradeLimiter } from './upgrade-limiter';

const EVICT_REASON = 'removed by an administrator';

/**
 * 房间里至多同时在线的设备数。
 *
 * @remarks
 * 每有一台设备上下线，presence 都把整张在线表推给每一台，代价随人数平方增长；这个 demo 的部署远到不了这个数。
 * 只数认证过的设备：还没 hello 的连接不进 presence，把它们算进来的话，谁挂着一堆空连接就能把别人挡在门外。
 */
export const MAX_ROOM_MEMBERS = 256;

/** 一个用户至多同时在线的实例数（一个标签页一个）：远多于正常使用，只挡一个账号占满房间。 */
export const MAX_MEMBERS_PER_USER = 32;

/**
 * 每个来源地址每分钟至多发起的信令升级数。
 *
 * @remarks
 * 一台设备断线后每 2 秒重连一次，一分钟 30 次；同一出口地址后面可能有好几台设备，这里只挡洪泛。
 */
export const MAX_UPGRADES_PER_MINUTE = 600;

/** 限速至多同时记着的来源地址数。 */
const MAX_TRACKED_SOURCES = 10_000;

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
  readonly #upgrades = new UpgradeLimiter({
    limit: MAX_UPGRADES_PER_MINUTE,
    windowMs: 60_000,
    maxSources: MAX_TRACKED_SOURCES,
    now: () => Date.now()
  });
  #hub: Promise<SignalingHub> | undefined;

  constructor(ctx: DurableObjectStateLike, env: Env) {
    this.#ctx = ctx;
    this.#env = env;
  }

  /**
   * 接受 WebSocket 升级；`/admin/*` 是 Worker 在验过管理员后发来的内部请求（在线列表、踢下线）。
   * 同一来源升级太频繁回 429；房间已满回 503，不升级：省下 hello 那两次认证宿主调用，客户端照常稍后重连
   * （名额的硬上限在 hello 时判）。来源取 Cloudflare 填的 `cf-connecting-ip`，没有这个头的请求都算同一个来源。
   *
   * @throws Error 签票私钥配置有误：在升级之前抛出，客户端拿到 500，而不是连上之后没有任何应答
   */
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(ROOM_ADMIN_PREFIX)) return this.#administer(request, pathname);
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    if (!this.#upgrades.allow(request.headers.get('cf-connecting-ip') ?? '')) {
      return new Response('too many signaling connections from this address', { status: 429 });
    }
    const hub = await this.#hubReady();
    if (hub.roster().length >= MAX_ROOM_MEMBERS) return new Response('the signaling room is full', { status: 503 });
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
      newConnectionId: () => crypto.randomUUID(),
      maxMembers: MAX_ROOM_MEMBERS,
      maxMembersPerUser: MAX_MEMBERS_PER_USER
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
