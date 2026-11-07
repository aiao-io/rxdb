/**
 * 桌面验收夹具的一端：独立的 Node 进程，经真实 TLS socket 与另一个进程建立 P2P 会话。
 *
 * @remarks
 * 由用例进程经 IPC 驱动（见 `peer-process.ts`），自己不做任何断言。TLS 用预共享密钥（PSK）套件，
 * 不需要证书文件；`socket.encrypted` 为真，满足 `createTcpTransport` 默认的强制加密。
 *
 * 运行方式：`node src/desktop/peer.ts <alice|bob> [--probe]`，靠 Node 26 的类型剥离执行。
 * `--probe` 让本端多声明一个 `acceptance.probe` 协议，用来验证「对端不支持」的协商结果。
 */
import {
  createP2PFileManifest,
  createP2PFilesProtocol,
  createP2PFilesSource,
  createTcpTransport,
  openP2PSession,
  P2PRequestError,
  transferP2PFile,
  type P2PChunkSource,
  type P2PFileManifest,
  type P2PFilesAuthorizeContext,
  type P2PLocalContent,
  type P2PPeerSession,
  type P2PProtocol,
  type P2PSessionRole
} from '@aiao/rxdb-plugin-p2p';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { connect, createServer, type Server, type TLSSocket } from 'node:tls';
import {
  CONNECTION_ID,
  credentialFor,
  patterned,
  PEERS,
  verifyCredential,
  type FileSpec,
  type PeerName
} from '../shared/fixtures.ts';
import type { PeerCommand, PeerEvent, PeerReply, PeerRequest, PeerResults, PulledFile } from './protocol.ts';

const PSK = Buffer.from('aiao-p2p-acceptance-pre-shared-key');
const PSK_IDENTITY = 'aiao-p2p-acceptance';
const TLS_OPTIONS = { ciphers: 'PSK-AES128-GCM-SHA256', minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' } as const;
const PROBE_PROTOCOL = 'acceptance.probe';

const [name, ...flags] = process.argv.slice(2);
if (!(name in PEERS)) throw new Error(`unknown peer ${name}; expected one of ${Object.keys(PEERS).join(', ')}`);
const local = PEERS[name as PeerName];

interface HeldFile {
  readonly manifest: P2PFileManifest;
  readonly bytes: Uint8Array;
}

interface PendingRequest {
  readonly controller: AbortController;
  readonly outcome: Promise<string>;
}

const held = new Map<string, HeldFile>();
const counters = { reads: 0, authorizeCalls: 0, connections: 0 };
let readDelayMs = 0;
let authorizeGate: Promise<void> | undefined;
let openAuthorizeGate: (() => void) | undefined;
let server: Server | undefined;
let pending: PendingRequest | undefined;
let current: P2PPeerSession | undefined;
let resolveSession!: (session: P2PPeerSession) => void;
const sessionOpened = new Promise<P2PPeerSession>(resolve => (resolveSession = resolve));

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const emit = (event: PeerEvent): void => {
  process.send?.(event);
};

const lookup = (contentHash: string): P2PLocalContent | undefined => {
  const file = held.get(contentHash);
  if (!file) return undefined;
  return {
    manifest: file.manifest,
    readRange: async (offset, size) => {
      counters.reads += 1;
      await delay(readDelayMs);
      return file.bytes.slice(offset, offset + size);
    }
  };
};

const authorize = async ({ signal }: P2PFilesAuthorizeContext): Promise<void> => {
  counters.authorizeCalls += 1;
  if (!authorizeGate) return;
  // 停在闸门上的请求收到对端的取消时通知用例：用例据此确认取消已到达，再开闸。
  signal.addEventListener('abort', () => emit({ kind: 'event', event: 'authorize-cancelled' }), { once: true });
  emit({ kind: 'event', event: 'authorize-waiting' });
  await authorizeGate;
};

const probe: P2PProtocol = { name: PROBE_PROTOCOL, version: 1, handle: () => ({ result: 'pong' }) };
const protocols: readonly P2PProtocol[] = [
  createP2PFilesProtocol({ contents: lookup, authorize }),
  ...(flags.includes('--probe') ? [probe] : [])
];

const openSession = (socket: TLSSocket, role: P2PSessionRole): void => {
  counters.connections += 1;
  const session = openP2PSession({
    transport: createTcpTransport(socket),
    role,
    connectionId: CONNECTION_ID,
    local,
    credential: credentialFor(local, CONNECTION_ID),
    authenticate: verifyCredential,
    protocols
  });
  void session.closed.then(reason => emit({ kind: 'event', event: 'session-closed', code: reason.code }));
  current = session;
  resolveSession(session);
};

const listen = (): Promise<PeerResults['listen']> =>
  new Promise((resolve, reject) => {
    const tlsServer = createServer(
      { ...TLS_OPTIONS, pskCallback: (_socket, identity) => (identity === PSK_IDENTITY ? PSK : null) },
      socket => openSession(socket, 'responder')
    );
    server = tlsServer;
    tlsServer.once('error', reject);
    tlsServer.listen(0, '127.0.0.1', () => resolve({ port: (tlsServer.address() as AddressInfo).port }));
  });

const dial = (port: number): Promise<PeerResults['connect']> =>
  new Promise((resolve, reject) => {
    const socket = connect({
      ...TLS_OPTIONS,
      host: '127.0.0.1',
      port,
      pskCallback: () => ({ psk: PSK, identity: PSK_IDENTITY }),
      // PSK 套件没有证书，默认的主机名校验无从核对。
      checkServerIdentity: () => undefined
    });
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      socket.off('error', reject);
      openSession(socket, 'initiator');
      resolve({ connectionId: CONNECTION_ID });
    });
  });

const ready = async (): Promise<PeerResults['ready']> => {
  const peer = await (await sessionOpened).ready;
  return { peer: peer.principal.principal };
};

const hold = async (files: readonly FileSpec[], delayMs = 0): Promise<PeerResults['hold']> => {
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
  return { manifests };
};

const pullOne = async (manifest: P2PFileManifest, source: P2PChunkSource): Promise<PulledFile> => {
  const bytes = new Uint8Array(manifest.size);
  await transferP2PFile({
    manifest,
    sources: [source],
    writeChunk: async (index, chunk) => void bytes.set(chunk, index * manifest.chunkSize)
  });
  return {
    contentHash: manifest.contentHash,
    digest: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength
  };
};

const pull = async (manifests: readonly P2PFileManifest[]): Promise<PeerResults['pull']> => {
  const session = await sessionOpened;
  await session.ready;
  const source = createP2PFilesSource(session, 'peer');
  return { files: await Promise.all(manifests.map(manifest => pullOne(manifest, source))) };
};

const probeProtocol = async (protocol: string): Promise<PeerResults['probe']> => {
  const session = await sessionOpened;
  try {
    await session.request(protocol, { method: 'ping' });
    return { code: 'ok' };
  } catch (error) {
    if (error instanceof P2PRequestError) return { code: error.code };
    throw error;
  }
};

const gateAuthorize = async (): Promise<null> => {
  authorizeGate = new Promise<void>(resolve => (openAuthorizeGate = resolve));
  return null;
};

const releaseAuthorize = async (): Promise<null> => {
  openAuthorizeGate?.();
  authorizeGate = undefined;
  return null;
};

const startRequest = async (manifest: P2PFileManifest): Promise<null> => {
  const session = await sessionOpened;
  const controller = new AbortController();
  const chunk = { contentHash: manifest.contentHash, offset: 0, size: Math.min(manifest.chunkSize, manifest.size) };
  const outcome = createP2PFilesSource(session, 'peer')
    .requestChunk(chunk, controller.signal)
    .then(
      () => 'completed',
      (error: unknown) => (error instanceof Error ? error.message : String(error))
    );
  pending = { controller, outcome };
  return null;
};

const cancelRequest = async (): Promise<PeerResults['cancel-request']> => {
  if (!pending) throw new Error('no request is in flight');
  pending.controller.abort(new Error('cancelled by the acceptance test'));
  return { outcome: await pending.outcome };
};

const stats = async (): Promise<PeerResults['stats']> => ({ ...counters, state: current?.state ?? 'none' });

const close = async (): Promise<null> => {
  await current?.close();
  server?.close();
  return null;
};

const run = (command: PeerCommand): Promise<unknown> => {
  switch (command.method) {
    case 'listen':
      return listen();
    case 'connect':
      return dial(command.port);
    case 'ready':
      return ready();
    case 'hold':
      return hold(command.files, command.readDelayMs);
    case 'pull':
      return pull(command.manifests);
    case 'probe':
      return probeProtocol(command.protocol);
    case 'gate-authorize':
      return gateAuthorize();
    case 'release-authorize':
      return releaseAuthorize();
    case 'start-request':
      return startRequest(command.manifest);
    case 'cancel-request':
      return cancelRequest();
    case 'stats':
      return stats();
    case 'close':
      return close();
  }
};

const reply = (message: PeerReply): void => {
  process.send?.(message);
};

process.on('message', (message: PeerRequest) => {
  run(message.command).then(
    result => reply({ kind: 'reply', id: message.id, result: result ?? null }),
    (error: unknown) =>
      reply({ kind: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) })
  );
});

// 用例进程退出或断开 IPC 时，对端进程随之退出，不留孤儿进程。
process.on('disconnect', () => process.exit(0));
