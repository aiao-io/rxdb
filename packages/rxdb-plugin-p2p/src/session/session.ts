/** 一对设备之间的多协议会话：hello 协商、请求复用、取消、心跳与按优先级发送。 */
import { asError, P2PRequestError, P2PSessionClosedError, type P2PSessionCloseCode } from './errors.js';
import { enqueueAbortable, type Deferred } from './frame-queue.js';
import {
  decodeP2PFrame,
  encodeP2PFrame,
  P2P_SESSION_VERSION,
  type P2PByteTransport,
  type P2PFrame,
  type P2PJsonValue
} from './frame.js';
import type { P2PPeerIdentity, P2PPrincipal } from './identity.js';
import { DEFAULT_MAX_CONCURRENT_REQUESTS, MAX_NAME_LENGTH, MAX_OUTSTANDING_REQUESTS } from './limits.js';

type RequestFrame = Extract<P2PFrame, { kind: 'request' }>;
type ReplyFrame = Extract<P2PFrame, { kind: 'response' | 'error' }>;

/** 一次请求的调用内容。 */
export interface P2PCall {
  /** 协议内的方法名。 */
  readonly method: string;
  /** JSON 参数，缺省为 `null`。 */
  readonly params?: P2PJsonValue;
  /** 二进制负载，缺省为空。 */
  readonly payload?: Uint8Array;
}

/** 一次请求的应答。 */
export interface P2PReply {
  /** JSON 结果。 */
  readonly result: P2PJsonValue;
  /** 二进制负载。 */
  readonly payload: Uint8Array;
}

/** 协议处理函数的返回值；缺省的结果为 `null`、负载为空。 */
export interface P2PHandlerResult {
  /** JSON 结果。 */
  readonly result?: P2PJsonValue;
  /** 二进制负载；带负载的应答按批量帧排队，让位于控制帧。 */
  readonly payload?: Uint8Array;
}

/** 传给协议处理函数的入站请求。 */
export interface P2PInboundRequest {
  /** 协议内的方法名。 */
  readonly method: string;
  /** JSON 参数。 */
  readonly params: P2PJsonValue;
  /** 二进制负载。 */
  readonly payload: Uint8Array;
  /** 已认证的对端身份。 */
  readonly peer: P2PPeerIdentity;
  /** 对端取消这次请求、或会话结束时中止。 */
  readonly signal: AbortSignal;
}

/** 本端支持的一个协议。 */
export interface P2PProtocol {
  /** 协议名，例如 `p2p.files`；在 hello 里声明。 */
  readonly name: string;
  /** 协议版本（正整数）；两端版本相同才算支持。 */
  readonly version: number;
  /** 同时处理的入站请求数，1～32，缺省 8；超出的排队，应答发不出去时名额一直占着。 */
  readonly maxConcurrentRequests?: number;
  /** 处理对端的请求；抛 {@link P2PRequestError} 时按其 code 应答，其它错误按 `internal` 应答。 */
  readonly handle: (request: P2PInboundRequest) => Promise<P2PHandlerResult> | P2PHandlerResult;
}

/** 本端在会话里的角色：发起连接的一方是 `initiator`，双向拨号去重时用。 */
export type P2PSessionRole = 'initiator' | 'responder';

/** 会话状态。 */
export type P2PSessionState = 'connecting' | 'ready' | 'closed';

/** 打开会话的选项。 */
export interface P2PSessionOptions {
  /** 已建立的字节通道；会话独占它的接收。 */
  readonly transport: P2PByteTransport;
  /** 本端的角色。 */
  readonly role: P2PSessionRole;
  /** 信令层分配的连接标识；对端凭据必须绑定到它，截获的凭据重放到别的连接即失效。 */
  readonly connectionId: string;
  /** 本端身份。 */
  readonly local: P2PPeerIdentity;
  /** 发给对端的身份凭据，由认证宿主签发并绑定到 `connectionId`。 */
  readonly credential: string;
  /** 校验对端凭据，返回认证宿主验证过的用户与设备；返回 null 或抛错即拒绝会话。 */
  readonly authenticate: (
    credential: string,
    context: { readonly connectionId: string }
  ) => Promise<P2PPrincipal | null> | P2PPrincipal | null;
  /** 本端支持的协议；协议名不得重复。 */
  readonly protocols: readonly P2PProtocol[];
  /** 等对端 hello 的上限（毫秒），缺省 10000。 */
  readonly helloTimeoutMs?: number;
  /** 心跳间隔（毫秒），缺省 5000。 */
  readonly heartbeatIntervalMs?: number;
  /** 多久收不到对端任何帧即判失联（毫秒），缺省 15000，须大于心跳间隔。 */
  readonly heartbeatTimeoutMs?: number;
}

/** 一对设备之间的会话。 */
export interface P2PPeerSession {
  /** 本端的角色。 */
  readonly role: P2PSessionRole;
  /** 信令层分配的连接标识。 */
  readonly connectionId: string;
  /** 本端身份。 */
  readonly local: P2PPeerIdentity;
  /** 双方交换 hello、对端通过认证后兑现对端身份；会话在此之前结束则以结束原因拒绝。 */
  readonly ready: Promise<P2PPeerIdentity>;
  /** 会话结束时兑现结束原因；从不拒绝。 */
  readonly closed: Promise<P2PSessionClosedError>;
  /** 已认证的对端身份；就绪之前为 undefined。 */
  readonly peer: P2PPeerIdentity | undefined;
  /** 会话状态。 */
  readonly state: P2PSessionState;
  /** 对端是否支持某协议：两端都声明、且版本相同。就绪之前恒为 false。 */
  supports(protocol: string): boolean;
  /**
   * 向对端发起一次请求；等到就绪再发，本端未完成请求超过 32 个时排队。
   *
   * @param signal - 取消这次请求：本端立刻放弃等待，并通知对端中止处理
   * @throws P2PRequestError 对端拒绝了请求，或协议未协商（`unsupported`）
   * @throws P2PSessionClosedError 会话已结束
   */
  request(protocol: string, call: P2PCall, signal?: AbortSignal): Promise<P2PReply>;
  /**
   * 结束会话：通知对端后关闭底层传输；可重复调用。
   *
   * @param reason - 告诉对端的原因：`closed`，或去重时的 `duplicate`
   */
  close(reason?: 'closed' | 'duplicate'): Promise<void>;
}

const MAX_TIMER_MS = 2 ** 31 - 1;
const DEFAULT_HELLO_TIMEOUT_MS = 10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15_000;
/** 结束会话时等 bye 发出的上限：对端不读时不无限等待。 */
const BYE_GRACE_MS = 500;
/** 值得告诉对端的结束原因；对端先走、对端失联、链路坏掉时，bye 发了也没人收。 */
const ANNOUNCED_CLOSE_CODES: ReadonlySet<P2PSessionCloseCode> = new Set([
  'closed',
  'unauthorized',
  'incompatible',
  'protocol_violation',
  'duplicate'
]);
const EMPTY = new Uint8Array(0);
const NEVER_ABORTED = new AbortController().signal;

const isName = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_LENGTH;

const integerOption = (name: string, value: number | undefined, defaultValue: number, max: number): number => {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > max) {
    throw new RangeError(`${name} must be an integer between 1 and ${max}`);
  }
  return resolved;
};

const isPrincipal = (value: unknown): value is P2PPrincipal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as P2PPrincipal).principal === 'string' &&
  (value as P2PPrincipal).principal.length > 0 &&
  typeof (value as P2PPrincipal).deviceId === 'string' &&
  (value as P2PPrincipal).deviceId.length > 0;

/** 未分类的失败：解码出错是对端违反协议，其余按链路故障处理。 */
const closeErrorOf = (error: unknown): P2PSessionClosedError => {
  if (error instanceof P2PSessionClosedError) return error;
  const code = error instanceof RangeError ? 'protocol_violation' : 'transport_failed';
  return new P2PSessionClosedError(code, asError(error).message, { cause: error });
};

const errorFrameOf = (id: number, error: unknown): P2PFrame =>
  error instanceof P2PRequestError && isName(error.code) ?
    { kind: 'error', id, code: error.code, message: error.message }
  : { kind: 'error', id, code: 'internal', message: asError(error).message };

interface Timing {
  readonly helloTimeoutMs: number;
  readonly heartbeatIntervalMs: number;
  /** 连续多少个心跳周期收不到任何帧即判失联。 */
  readonly missedBeatLimit: number;
}

const resolveTiming = (options: P2PSessionOptions): Timing => {
  const heartbeatIntervalMs = integerOption(
    'heartbeatIntervalMs',
    options.heartbeatIntervalMs,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    MAX_TIMER_MS
  );
  const heartbeatTimeoutMs = integerOption(
    'heartbeatTimeoutMs',
    options.heartbeatTimeoutMs,
    DEFAULT_HEARTBEAT_TIMEOUT_MS,
    MAX_TIMER_MS
  );
  if (heartbeatTimeoutMs <= heartbeatIntervalMs)
    throw new RangeError('heartbeatTimeoutMs must be greater than heartbeatIntervalMs');
  return {
    helloTimeoutMs: integerOption('helloTimeoutMs', options.helloTimeoutMs, DEFAULT_HELLO_TIMEOUT_MS, MAX_TIMER_MS),
    heartbeatIntervalMs,
    missedBeatLimit: Math.ceil(heartbeatTimeoutMs / heartbeatIntervalMs)
  };
};

/** 一个协议的入站车道：并发上限与排队中的请求。 */
interface InboundLane {
  readonly protocol: P2PProtocol;
  readonly limit: number;
  active: number;
  readonly queue: RequestFrame[];
}

const lanesOf = (protocols: readonly P2PProtocol[]): ReadonlyMap<string, InboundLane> => {
  const lanes = new Map<string, InboundLane>();
  for (const protocol of protocols) {
    if (!isName(protocol.name) || lanes.has(protocol.name))
      throw new RangeError(`protocol names must be unique, non-empty and at most ${MAX_NAME_LENGTH} characters`);
    if (!Number.isSafeInteger(protocol.version) || protocol.version < 1)
      throw new RangeError(`protocol ${protocol.name} version must be a positive integer`);
    const limit = integerOption(
      'maxConcurrentRequests',
      protocol.maxConcurrentRequests,
      DEFAULT_MAX_CONCURRENT_REQUESTS,
      MAX_OUTSTANDING_REQUESTS
    );
    lanes.set(protocol.name, { protocol, limit, active: 0, queue: [] });
  }
  return lanes;
};

/** 本端发出请求的名额：与对端执行的协议上限一致，超出时排队等候。 */
class RequestSlots {
  readonly #waiters: Array<Deferred<void>> = [];
  #available = MAX_OUTSTANDING_REQUESTS;
  #failure: Error | undefined;

  acquire(signal: AbortSignal): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    if (this.#available > 0) {
      this.#available -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => enqueueAbortable(this.#waiters, { resolve, reject }, signal));
  }

  release(): void {
    const next = this.#waiters.shift();
    if (next) next.resolve();
    else this.#available += 1;
  }

  fail(error: Error): void {
    this.#failure = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }
}

interface Outbound {
  readonly bytes: Uint8Array;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

/** 按优先级串行发送：控制帧先于带负载的批量帧出队，同一车道内保持先后。 */
class FrameSender {
  readonly #transport: P2PByteTransport;
  readonly #onFailure: (error: Error) => void;
  readonly #control: Outbound[] = [];
  readonly #bulk: Outbound[] = [];
  #running = false;
  #failure: Error | undefined;

  constructor(transport: P2PByteTransport, onFailure: (error: Error) => void) {
    this.#transport = transport;
    this.#onFailure = onFailure;
  }

  /** 排队一帧；交给底层传输后兑现，底层发送失败或发送方已停止则拒绝。 */
  send(bytes: Uint8Array, bulk: boolean): Promise<void> {
    if (this.#failure) return Promise.reject(this.#failure);
    return new Promise<void>((resolve, reject) => {
      (bulk ? this.#bulk : this.#control).push({ bytes, resolve, reject });
      void this.#run();
    });
  }

  /** 停止发送：拒绝全部排队中的帧；首个失败原因保留到底。 */
  fail(error: Error): void {
    this.#failure ??= error;
    for (const item of [...this.#control.splice(0), ...this.#bulk.splice(0)]) item.reject(this.#failure);
  }

  async #run(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    for (let item = this.#next(); item; item = this.#next()) await this.#write(item);
    this.#running = false;
  }

  #next(): Outbound | undefined {
    return this.#control.shift() ?? this.#bulk.shift();
  }

  async #write(item: Outbound): Promise<void> {
    try {
      await this.#transport.send(item.bytes);
      item.resolve();
    } catch (error) {
      const failure = asError(error);
      item.reject(failure);
      this.fail(failure);
      this.#onFailure(failure);
    }
  }
}

/** 入站请求：按协议限并发，超出的排队；全会话未完成请求超过上限即判对端违反协议。 */
class InboundRequests {
  readonly #lanes: ReadonlyMap<string, InboundLane>;
  readonly #serve: (lane: InboundLane, frame: RequestFrame, signal: AbortSignal) => Promise<void>;
  readonly #controllers = new Map<number, AbortController>();
  #stopped = false;

  constructor(
    lanes: ReadonlyMap<string, InboundLane>,
    serve: (lane: InboundLane, frame: RequestFrame, signal: AbortSignal) => Promise<void>
  ) {
    this.#lanes = lanes;
    this.#serve = serve;
  }

  lane(protocol: string): InboundLane | undefined {
    return this.#lanes.get(protocol);
  }

  /** 收下一个请求；请求号仍在处理中、或未完成请求已达上限时返回 false。 */
  admit(lane: InboundLane, frame: RequestFrame): boolean {
    if (this.#controllers.has(frame.id) || this.#controllers.size >= MAX_OUTSTANDING_REQUESTS) return false;
    this.#controllers.set(frame.id, new AbortController());
    lane.queue.push(frame);
    this.#drain(lane);
    return true;
  }

  /** 对端放弃了一个请求：排队中的不再处理，处理中的收到中止信号。 */
  cancel(id: number): void {
    this.#controllers.get(id)?.abort(new P2PRequestError('cancelled', 'request was cancelled by peer'));
  }

  /** 会话结束：中止处理中的请求，丢弃排队中的请求。 */
  stop(reason: Error): void {
    this.#stopped = true;
    for (const controller of this.#controllers.values()) controller.abort(reason);
    this.#controllers.clear();
    for (const lane of this.#lanes.values()) lane.queue.length = 0;
  }

  #drain(lane: InboundLane): void {
    while (!this.#stopped && lane.active < lane.limit && lane.queue.length > 0) {
      const frame = lane.queue.shift() as RequestFrame;
      const controller = this.#controllers.get(frame.id) as AbortController;
      lane.active += 1;
      void this.#serve(lane, frame, controller.signal).finally(() => this.#finish(lane, frame.id));
    }
  }

  #finish(lane: InboundLane, id: number): void {
    lane.active -= 1;
    this.#controllers.delete(id);
    this.#drain(lane);
  }
}

/** 会话实现；经 {@link openP2PSession} 创建。 */
class PeerSession implements P2PPeerSession {
  readonly #transport: P2PByteTransport;
  readonly #authenticate: P2PSessionOptions['authenticate'];
  readonly #timing: Timing;
  readonly #inbound: InboundRequests;
  readonly #sender: FrameSender;
  readonly #slots = new RequestSlots();
  readonly #outgoing = new Map<number, Deferred<P2PReply>>();
  readonly #settleReady: Deferred<P2PPeerIdentity>;
  readonly #resolveClosed: (reason: P2PSessionClosedError) => void;
  readonly #lanes: ReadonlyMap<string, InboundLane>;
  #remoteProtocols: ReadonlyMap<string, number> = new Map();
  #peer: P2PPeerIdentity | undefined;
  #closeReason: P2PSessionClosedError | undefined;
  #closing: Promise<void> = Promise.resolve();
  #sequence = 0;
  #receivedSinceBeat = true;
  #missedBeats = 0;
  #helloTimer: ReturnType<typeof setTimeout> | undefined;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  readonly role: P2PSessionRole;
  readonly connectionId: string;
  readonly local: P2PPeerIdentity;
  readonly ready: Promise<P2PPeerIdentity>;
  readonly closed: Promise<P2PSessionClosedError>;

  get peer(): P2PPeerIdentity | undefined {
    return this.#peer;
  }

  get state(): P2PSessionState {
    if (this.#closeReason) return 'closed';
    return this.#peer ? 'ready' : 'connecting';
  }

  constructor(options: P2PSessionOptions) {
    this.#timing = resolveTiming(options);
    this.#lanes = lanesOf(options.protocols);
    if (!isName(options.local.instanceId))
      throw new RangeError(`local instanceId must be non-empty and at most ${MAX_NAME_LENGTH} characters`);
    const hello = encodeP2PFrame({
      kind: 'hello',
      session: P2P_SESSION_VERSION,
      instanceId: options.local.instanceId,
      credential: options.credential,
      protocols: Object.fromEntries([...this.#lanes.values()].map(lane => [lane.protocol.name, lane.protocol.version]))
    });
    this.#transport = options.transport;
    this.#authenticate = options.authenticate;
    this.role = options.role;
    this.connectionId = options.connectionId;
    this.local = options.local;
    let settleReady!: Deferred<P2PPeerIdentity>;
    this.ready = new Promise<P2PPeerIdentity>((resolve, reject) => (settleReady = { resolve, reject }));
    this.ready.catch(() => undefined);
    this.#settleReady = settleReady;
    let resolveClosed!: (reason: P2PSessionClosedError) => void;
    this.closed = new Promise<P2PSessionClosedError>(resolve => (resolveClosed = resolve));
    this.#resolveClosed = resolveClosed;
    this.#sender = new FrameSender(options.transport, error =>
      this.#shutdown(new P2PSessionClosedError('transport_failed', error.message, { cause: error }))
    );
    this.#inbound = new InboundRequests(this.#lanes, (lane, frame, signal) => this.#serve(lane, frame, signal));
    this.#post(hello, false);
    this.#helloTimer = setTimeout(
      () => this.#shutdown(new P2PSessionClosedError('peer_lost', 'peer did not send hello in time')),
      this.#timing.helloTimeoutMs
    );
    void this.#pump();
  }

  supports(protocol: string): boolean {
    const version = this.#remoteProtocols.get(protocol);
    return version !== undefined && version === this.#lanes.get(protocol)?.protocol.version;
  }

  async request(protocol: string, call: P2PCall, signal: AbortSignal = NEVER_ABORTED): Promise<P2PReply> {
    await this.ready;
    if (!this.supports(protocol))
      throw new P2PRequestError('unsupported', `peer does not support protocol ${protocol}`);
    signal.throwIfAborted();
    const payload = call.payload ?? EMPTY;
    await this.#slots.acquire(signal);
    const id = this.#sequence++;
    try {
      const frame = encodeP2PFrame({
        kind: 'request',
        id,
        protocol,
        method: call.method,
        params: call.params ?? null,
        payload
      });
      const reply = this.#awaitReply(id, signal);
      this.#post(frame, payload.byteLength > 0);
      return await reply;
    } finally {
      this.#outgoing.delete(id);
      this.#slots.release();
    }
  }

  close(reason: 'closed' | 'duplicate' = 'closed'): Promise<void> {
    const message = reason === 'duplicate' ? 'P2P session closed as a duplicate' : 'P2P session closed';
    this.#shutdown(new P2PSessionClosedError(reason, message));
    return this.#closing;
  }

  async #pump(): Promise<void> {
    try {
      await this.#handshake(await this.#receive());
      while (!this.#closeReason) this.#dispatch(await this.#receive());
    } catch (error) {
      this.#shutdown(closeErrorOf(error));
    }
  }

  async #receive(): Promise<P2PFrame | null> {
    const frame = decodeP2PFrame(await this.#transport.receive());
    this.#receivedSinceBeat = true;
    return frame;
  }

  async #handshake(frame: P2PFrame | null): Promise<void> {
    clearTimeout(this.#helloTimer);
    if (frame?.kind !== 'hello') throw new P2PSessionClosedError('protocol_violation', 'peer did not start with hello');
    if (frame.session !== P2P_SESSION_VERSION)
      throw new P2PSessionClosedError('incompatible', `peer speaks session protocol version ${frame.session}`);
    const principal = await this.#verify(frame.credential);
    if (this.#closeReason) return;
    this.#peer = { principal, instanceId: frame.instanceId };
    this.#remoteProtocols = new Map(Object.entries(frame.protocols));
    this.#settleReady.resolve(this.#peer);
    this.#heartbeat = setInterval(() => this.#beat(), this.#timing.heartbeatIntervalMs);
  }

  async #verify(credential: string): Promise<P2PPrincipal> {
    let principal: P2PPrincipal | null;
    try {
      principal = await this.#authenticate(credential, { connectionId: this.connectionId });
    } catch (error) {
      throw new P2PSessionClosedError('unauthorized', 'peer credential was rejected', { cause: error });
    }
    if (!isPrincipal(principal)) throw new P2PSessionClosedError('unauthorized', 'peer credential was rejected');
    return principal;
  }

  #dispatch(frame: P2PFrame | null): void {
    switch (frame?.kind) {
      case 'request':
        this.#admit(frame);
        return;
      case 'response':
      case 'error':
        this.#settle(frame);
        return;
      case 'cancel':
        this.#inbound.cancel(frame.id);
        return;
      case 'ping':
        this.#post(encodeP2PFrame({ kind: 'pong' }), false);
        return;
      case 'bye':
        throw new P2PSessionClosedError('peer_closed', `peer closed the session: ${frame.reason}`, {
          peerReason: frame.reason
        });
      case 'hello':
        throw new P2PSessionClosedError('protocol_violation', 'peer sent hello twice');
      default:
        // pong 与较新版本的未知帧只用来证明对端还活着
        return;
    }
  }

  #admit(frame: RequestFrame): void {
    const lane = this.#inbound.lane(frame.protocol);
    if (!lane || !this.supports(frame.protocol)) {
      const message = `protocol ${frame.protocol} is not supported`;
      this.#post(encodeP2PFrame({ kind: 'error', id: frame.id, code: 'unsupported', message }), false);
      return;
    }
    if (!this.#inbound.admit(lane, frame))
      throw new P2PSessionClosedError('protocol_violation', 'peer exceeded the outstanding request limit');
  }

  #settle(frame: ReplyFrame): void {
    const waiter = this.#outgoing.get(frame.id);
    if (!waiter) return;
    this.#outgoing.delete(frame.id);
    if (frame.kind === 'response') waiter.resolve({ result: frame.result, payload: frame.payload });
    else waiter.reject(new P2PRequestError(frame.code, frame.message));
  }

  /** 处理一个入站请求；应答交给底层传输之前一直占着车道名额。从不拒绝。 */
  async #serve(lane: InboundLane, frame: RequestFrame, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const [bytes, bulk] = await this.#invoke(lane.protocol, frame, signal);
    if (signal.aborted) return;
    await this.#sender.send(bytes, bulk).catch(() => undefined);
  }

  /** 调用处理函数并编码应答：处理函数抛错、或应答超出协议上限，都编码成错误应答。 */
  async #invoke(protocol: P2PProtocol, frame: RequestFrame, signal: AbortSignal): Promise<[Uint8Array, boolean]> {
    try {
      const { method, params, payload } = frame;
      const result = await protocol.handle({ method, params, payload, peer: this.#peer as P2PPeerIdentity, signal });
      const replyPayload = result.payload ?? EMPTY;
      const reply = { kind: 'response', id: frame.id, result: result.result ?? null, payload: replyPayload } as const;
      return [encodeP2PFrame(reply), replyPayload.byteLength > 0];
    } catch (error) {
      return [encodeP2PFrame(errorFrameOf(frame.id, error)), false];
    }
  }

  #awaitReply(id: number, signal: AbortSignal): Promise<P2PReply> {
    const reply = new Promise<P2PReply>((resolve, reject) => {
      const abort = (): void => {
        reject(signal.reason);
        this.#cancelRemote(id);
      };
      const settled =
        <T>(settle: (value: T) => void) =>
        (value: T): void => {
          signal.removeEventListener('abort', abort);
          settle(value);
        };
      this.#outgoing.set(id, { resolve: settled(resolve), reject: settled(reject) });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    reply.catch(() => undefined);
    return reply;
  }

  #cancelRemote(id: number): void {
    if (!this.#closeReason && this.#outgoing.has(id)) this.#post(encodeP2PFrame({ kind: 'cancel', id }), false);
  }

  /** 发一帧不等结果：发送失败经 {@link FrameSender} 的失败回调结束会话。 */
  #post(bytes: Uint8Array, bulk: boolean): void {
    void this.#sender.send(bytes, bulk).catch(() => undefined);
  }

  #beat(): void {
    this.#missedBeats = this.#receivedSinceBeat ? 0 : this.#missedBeats + 1;
    this.#receivedSinceBeat = false;
    if (this.#missedBeats >= this.#timing.missedBeatLimit) {
      this.#shutdown(new P2PSessionClosedError('peer_lost', 'peer stopped answering heartbeats'));
      return;
    }
    this.#post(encodeP2PFrame({ kind: 'ping' }), false);
  }

  #shutdown(reason: P2PSessionClosedError): void {
    if (this.#closeReason) return;
    this.#closeReason = reason;
    clearTimeout(this.#helloTimer);
    clearInterval(this.#heartbeat);
    this.#inbound.stop(reason);
    for (const waiter of this.#outgoing.values()) waiter.reject(reason);
    this.#outgoing.clear();
    this.#slots.fail(reason);
    this.#sender.fail(reason);
    this.#settleReady.reject(reason);
    this.#resolveClosed(reason);
    this.#closing = this.#release(reason.code);
    this.#closing.catch(() => undefined);
  }

  /** 需要告诉对端的原因先发 bye（最多等 {@link BYE_GRACE_MS}），再关闭底层传输。 */
  async #release(code: P2PSessionCloseCode): Promise<void> {
    if (ANNOUNCED_CLOSE_CODES.has(code)) await this.#sayBye(code);
    await this.#transport.close();
  }

  async #sayBye(code: P2PSessionCloseCode): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<void>(resolve => (timer = setTimeout(resolve, BYE_GRACE_MS)));
    const sent = this.#transport.send(encodeP2PFrame({ kind: 'bye', reason: code })).catch(() => undefined);
    await Promise.race([sent, grace]);
    clearTimeout(timer);
  }
}

/**
 * 在已建立的字节通道上打开会话：双方先交换 hello 并认证对端，之后多个协议在同一条通道上复用。
 *
 * @remarks
 * 一对设备只需一条会话：任意协议的请求都按协议名分派，同一协议的入站请求按 `maxConcurrentRequests`
 * 限并发，全会话未完成请求超过 32 个即视为对端违反协议。控制帧（hello、心跳、取消、不带负载的应答）
 * 先于带负载的批量帧发送，大文件传输不会把小消息压在后面。
 *
 * 对端凭据未通过认证时只回通用的 `unauthorized`，不泄露本端持有的任何内容；
 * 未知的帧类型被忽略，较新版本的对端不会因此断连；畸形帧、超限、乱序 hello 即结束会话。
 * 心跳超时以 `peer_lost` 结束会话，不依赖下一次请求失败才发现对端失联。
 *
 * @throws RangeError 选项越界、协议名重复或不合法、本端实例标识不合法，或凭据让 hello 超出元数据上限
 */
export function openP2PSession(options: P2PSessionOptions): P2PPeerSession {
  return new PeerSession(options);
}
