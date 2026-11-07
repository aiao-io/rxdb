/**
 * 浏览器验收夹具：每个浏览器上下文里一份，经真实的 WebRTC DataChannel 与另一个上下文建立 P2P 会话。
 *
 * @remarks
 * 用例经 `page.evaluate` 驱动（API 见 `harness-api.ts`），自己不做断言。SDP 由用例在两个上下文之间搬运，
 * 不经信令服务器，也不做 trickle ICE：等候选收集完再交出整份描述。发出的每一帧都记进 trace，
 * 供「控制帧先于批量帧」的验收按交给 DataChannel 的先后核对。
 */
import {
  createP2PFileManifest,
  createP2PFilesProtocol,
  createP2PFilesSource,
  createWebRTCTransport,
  decodeP2PFrame,
  digestSha256Hex,
  openP2PSession,
  P2PRequestError,
  P2PSessionClosedError,
  P2PSessionRegistry,
  transferP2PFile,
  type P2PByteTransport,
  type P2PFileManifest,
  type P2PFilesAuthorizeContext,
  type P2PLocalContent,
  type P2PPeerSession,
  type P2PProtocol,
  type P2PSessionRole
} from '@aiao/rxdb-plugin-p2p';
import { credentialFor, patterned, PEERS, verifyCredential, type FileSpec } from '../shared/fixtures.ts';
import {
  PROBE_PROTOCOL,
  type ClosedOutcome,
  type Harness,
  type HarnessOptions,
  type PulledFile,
  type ReadyOutcome,
  type RequestOutcome,
  type TraceEntry
} from './harness-api.ts';

interface HeldFile {
  readonly manifest: P2PFileManifest;
  readonly bytes: Uint8Array;
}

interface Connection {
  readonly pc: RTCPeerConnection;
  readonly trace: TraceEntry[];
  readonly session: Promise<P2PPeerSession>;
  readonly settleSession: (session: P2PPeerSession) => void;
  current?: P2PPeerSession;
}

let options: HarnessOptions = { name: 'alice' };
const connections = new Map<string, Connection>();
const registry = new P2PSessionRegistry();
const held = new Map<string, HeldFile>();
const counters = { reads: 0, authorizeCalls: 0, offers: 0, answers: 0, pulledChunks: 0, probes: 0 };
let readDelayMs = 0;
/** 发送闸：关着时，会话交给 DataChannel 的下一帧停在闸口，其后的帧留在会话自己的发送队列里。 */
let sendGate: Promise<void> | undefined;
let openSendGate: (() => void) | undefined;
let gate: Promise<void> | undefined;
let openGate: (() => void) | undefined;
let pendingRequest: { readonly controller: AbortController; readonly outcome: Promise<string> } | undefined;
let pendingPull: Promise<readonly PulledFile[]> | undefined;
let chunkWaiters: Array<{ readonly chunks: number; readonly resolve: () => void }> = [];

/** 发生过一次就一直算发生过：等待者早于或晚于事件注册都能兑现。 */
class Latch {
  #hits = 0;
  #waiters: Array<() => void> = [];

  hit(): void {
    this.#hits += 1;
    for (const notify of this.#waiters.splice(0)) notify();
  }

  wait(): Promise<void> {
    if (this.#hits > 0) return Promise.resolve();
    return new Promise<void>(resolve => this.#waiters.push(resolve));
  }

  reset(): void {
    this.#hits = 0;
    this.#waiters = [];
  }
}

/** 有授权调用停在闸门上。 */
const gateReached = new Latch();
/** 停在闸门上的请求收到了对端的取消。 */
const gateCancelled = new Latch();

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const lookup = (contentHash: string): P2PLocalContent | undefined => {
  const file = held.get(contentHash);
  if (!file) return undefined;
  return {
    manifest: file.manifest,
    readRange: async (offset, size) => {
      counters.reads += 1;
      // 不设延迟时不经过定时器：应答在收到请求的同一轮微任务里入队，先后完全由请求顺序决定。
      if (readDelayMs > 0) await delay(readDelayMs);
      return file.bytes.slice(offset, offset + size);
    }
  };
};

const authorize = async ({ contentHash, signal }: P2PFilesAuthorizeContext): Promise<void> => {
  counters.authorizeCalls += 1;
  if (options.denied?.includes(contentHash)) throw new Error('content is not shared with this peer');
  if (!gate) return;
  signal.addEventListener('abort', () => gateCancelled.hit(), { once: true });
  gateReached.hit();
  await gate;
};

const PROBE: P2PProtocol = {
  name: PROBE_PROTOCOL,
  version: 1,
  handle: () => {
    counters.probes += 1;
    return { result: 'pong' };
  }
};

const protocols = (): readonly P2PProtocol[] => [
  createP2PFilesProtocol({ contents: lookup, authorize }),
  ...(options.probe ? [PROBE] : [])
];

const summarize = (bytes: Uint8Array): TraceEntry => {
  const frame = decodeP2PFrame(bytes);
  if (frame?.kind === 'response') {
    const result = typeof frame.result === 'string' ? frame.result : null;
    return { kind: 'response', id: frame.id, payloadBytes: frame.payload.byteLength, result };
  }
  const id = frame && 'id' in frame ? frame.id : null;
  return { kind: frame?.kind ?? 'unknown', id, payloadBytes: 0, result: null };
};

/** 记下每一帧交给 DataChannel 的先后；发送闸关着时先停在闸口。 */
const recording = (transport: P2PByteTransport, trace: TraceEntry[]): P2PByteTransport => ({
  send: async frame => {
    await sendGate;
    trace.push(summarize(frame));
    return transport.send(frame);
  },
  receive: signal => transport.receive(signal),
  close: () => transport.close()
});

const connectionOf = (connectionId: string, pc: RTCPeerConnection): Connection => {
  let settleSession!: (session: P2PPeerSession) => void;
  const session = new Promise<P2PPeerSession>(resolve => (settleSession = resolve));
  const connection = { pc, trace: [], session, settleSession };
  connections.set(connectionId, connection);
  return connection;
};

const existing = (connectionId: string): Connection => {
  const connection = connections.get(connectionId);
  if (!connection) throw new Error(`unknown connection ${connectionId}`);
  return connection;
};

const openSession = (
  connectionId: string,
  connection: Connection,
  channel: RTCDataChannel,
  role: P2PSessionRole,
  credential?: string
): void => {
  const local = PEERS[options.name];
  const session = openP2PSession({
    transport: recording(createWebRTCTransport(channel), connection.trace),
    role,
    connectionId,
    local,
    credential: credential ?? credentialFor(local, connectionId),
    authenticate: verifyCredential,
    protocols: protocols(),
    helloTimeoutMs: 30_000,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    heartbeatTimeoutMs: options.heartbeatTimeoutMs
  });
  void registry.add(session).catch(() => undefined);
  connection.current = session;
  connection.settleSession(session);
};

/** 等候选收集完：不做 trickle ICE，整份描述一次交给对端。 */
const iceGathered = (pc: RTCPeerConnection): Promise<void> =>
  new Promise(resolve => {
    const check = (): void => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', check);
    check();
  });

const localDescriptionOf = async (pc: RTCPeerConnection): Promise<string> => {
  await iceGathered(pc);
  return JSON.stringify(pc.localDescription);
};

const notifyChunkWaiters = (): void => {
  const reached = chunkWaiters.filter(waiter => waiter.chunks <= counters.pulledChunks);
  chunkWaiters = chunkWaiters.filter(waiter => waiter.chunks > counters.pulledChunks);
  for (const waiter of reached) waiter.resolve();
};

const outcomeOf = (error: unknown): ClosedOutcome =>
  error instanceof P2PSessionClosedError ?
    { code: error.code, peerReason: error.peerReason ?? null, message: error.message }
  : { code: 'error', peerReason: null, message: messageOf(error) };

const requestOutcomeOf = (error: unknown): RequestOutcome => ({
  ok: false,
  code: error instanceof P2PRequestError || error instanceof P2PSessionClosedError ? error.code : 'error',
  message: messageOf(error)
});

const pullOne = async (
  session: P2PPeerSession,
  manifest: P2PFileManifest,
  concurrency?: number
): Promise<PulledFile> => {
  const bytes = new Uint8Array(manifest.size);
  await transferP2PFile({
    manifest,
    sources: [createP2PFilesSource(session, 'peer')],
    concurrency,
    writeChunk: async (index, chunk) => {
      bytes.set(chunk, index * manifest.chunkSize);
      counters.pulledChunks += 1;
      notifyChunkWaiters();
    }
  });
  return { contentHash: manifest.contentHash, digest: await digestSha256Hex(bytes), size: bytes.byteLength };
};

const pullAll = async (
  connectionId: string,
  manifests: readonly P2PFileManifest[],
  concurrency?: number
): Promise<readonly PulledFile[]> => {
  const session = await existing(connectionId).session;
  return Promise.all(manifests.map(manifest => pullOne(session, manifest, concurrency)));
};

const harness: Harness = {
  configure(next) {
    options = next;
  },
  async createOffer(connectionId, credential) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const connection = connectionOf(connectionId, pc);
    openSession(connectionId, connection, pc.createDataChannel('p2p', { ordered: true }), 'initiator', credential);
    await pc.setLocalDescription(await pc.createOffer());
    counters.offers += 1;
    return localDescriptionOf(pc);
  },
  async acceptOffer(connectionId, offer) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const connection = connectionOf(connectionId, pc);
    pc.addEventListener('datachannel', event => openSession(connectionId, connection, event.channel, 'responder'), {
      once: true
    });
    await pc.setRemoteDescription(JSON.parse(offer) as RTCSessionDescriptionInit);
    await pc.setLocalDescription(await pc.createAnswer());
    counters.answers += 1;
    return localDescriptionOf(pc);
  },
  async acceptAnswer(connectionId, answer) {
    await existing(connectionId).pc.setRemoteDescription(JSON.parse(answer) as RTCSessionDescriptionInit);
  },
  async ready(connectionId): Promise<ReadyOutcome> {
    const session = await existing(connectionId).session;
    try {
      const peer = await session.ready;
      return { ok: true, peer: peer.principal.principal };
    } catch (error) {
      return { ok: false, ...outcomeOf(error) };
    }
  },
  async closed(connectionId) {
    const session = await existing(connectionId).session;
    return outcomeOf(await session.closed);
  },
  async hold(files: readonly FileSpec[], delayMs = 0) {
    readDelayMs = delayMs;
    const manifests: P2PFileManifest[] = [];
    for (const spec of files) {
      const bytes = patterned(spec.size, spec.seed);
      const manifest = await createP2PFileManifest({
        fileName: `file-${spec.seed}.bin`,
        size: spec.size,
        chunkSize: spec.chunkSize,
        readChunk: async (offset, size) => bytes.slice(offset, offset + size)
      });
      held.set(manifest.contentHash, { manifest, bytes });
      manifests.push(manifest);
    }
    return manifests;
  },
  pull: pullAll,
  startPull(connectionId, manifests, concurrency) {
    pendingPull = pullAll(connectionId, manifests, concurrency);
    pendingPull.catch(() => undefined);
  },
  waitPulledChunks(chunks) {
    if (counters.pulledChunks >= chunks) return Promise.resolve();
    return new Promise(resolve => chunkWaiters.push({ chunks, resolve }));
  },
  async finishPull() {
    if (!pendingPull) throw new Error('no pull is in flight');
    return pendingPull;
  },
  async requestChunk(connectionId, manifest) {
    const session = await existing(connectionId).session;
    const chunk = { contentHash: manifest.contentHash, offset: 0, size: Math.min(manifest.chunkSize, manifest.size) };
    try {
      await createP2PFilesSource(session, 'peer').requestChunk(chunk, new AbortController().signal);
      return { ok: true };
    } catch (error) {
      return requestOutcomeOf(error);
    }
  },
  async probe(connectionId, protocol) {
    const session = await existing(connectionId).session;
    try {
      await session.request(protocol, { method: 'ping' });
      return { ok: true };
    } catch (error) {
      return requestOutcomeOf(error);
    }
  },
  gateAuthorize() {
    gate = new Promise<void>(resolve => (openGate = resolve));
    gateReached.reset();
    gateCancelled.reset();
  },
  authorizeWaiting() {
    return gateReached.wait();
  },
  authorizeCancelled() {
    return gateCancelled.wait();
  },
  releaseAuthorize() {
    openGate?.();
    gate = undefined;
  },
  gateSends() {
    sendGate = new Promise<void>(resolve => (openSendGate = resolve));
  },
  releaseSends() {
    openSendGate?.();
    sendGate = undefined;
  },
  startRequest(connectionId, manifest) {
    const controller = new AbortController();
    const chunk = { contentHash: manifest.contentHash, offset: 0, size: Math.min(manifest.chunkSize, manifest.size) };
    const outcome = existing(connectionId)
      .session.then(session => createP2PFilesSource(session, 'peer').requestChunk(chunk, controller.signal))
      .then(
        () => 'completed',
        (error: unknown) => messageOf(error)
      );
    pendingRequest = { controller, outcome };
  },
  async cancelRequest() {
    if (!pendingRequest) throw new Error('no request is in flight');
    pendingRequest.controller.abort(new Error('cancelled by the acceptance test'));
    return pendingRequest.outcome;
  },
  stats() {
    const states = Object.fromEntries(
      [...connections].map(([id, connection]) => [id, connection.current?.state ?? 'none'])
    );
    return { ...counters, sessions: registry.sessions.map(session => session.connectionId), states };
  },
  trace(connectionId) {
    return existing(connectionId).trace;
  }
};

window.p2pHarness = harness;
