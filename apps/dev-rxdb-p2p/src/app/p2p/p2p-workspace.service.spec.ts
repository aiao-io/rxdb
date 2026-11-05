import {
  createAuthenticatedP2PFileManifest,
  createManifestRecord,
  deriveHolderId,
  P2PFileManifestEntity,
  toRxDBManifestDocument,
  type P2PManifestRecord,
  type P2PPeerSession,
  type P2PPrincipal
} from '@aiao/rxdb-plugin-p2p';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingPeer } from '../../../shared/signaling-protocol';
import { AuthService } from '../auth/auth.service';
import type { writeEnvelopes } from '../device/fallback-envelopes';
import type { HeldFileWriter } from './held-files';
import { P2PWorkspace, type SharedFileView } from './p2p-workspace.service';
import type { LinkView, PeerLinksOptions } from './peer-links';
import type { ConnectionOffer, SignalingClientOptions, SignalingProblem, SignalingState } from './signaling-client';

const storage = vi.hoisted(() => ({
  createWriter: vi.fn<() => Promise<HeldFileWriter>>(),
  store: vi.fn<(hash: string, file: File) => Promise<void>>(),
  open: vi.fn<(hash: string) => Promise<File | null>>(),
  remove: vi.fn<(hash: string) => Promise<void>>()
}));
const persistence = vi.hoisted(() => ({
  findAll: vi.fn<() => BehaviorSubject<P2PFileManifestEntity[]>>(),
  save: vi.fn<(row: P2PFileManifestEntity) => Promise<void>>(),
  remove: vi.fn<(row: P2PFileManifestEntity) => Promise<void>>(),
  connect: vi.fn<() => Promise<void>>(),
  push: vi.fn<() => Promise<void>>()
}));
const network = vi.hoisted(() => ({
  connect: vi.fn<(key: string) => Promise<P2PPeerSession>>(),
  disconnect: vi.fn<(id: string) => void>(),
  peerOptions: vi.fn<(options: PeerLinksOptions) => void>(),
  signalOptions: vi.fn<(options: SignalingClientOptions) => void>(),
  presence: vi.fn<() => BehaviorSubject<readonly SignalingPeer[]>>(),
  state: vi.fn<() => BehaviorSubject<SignalingState>>(),
  problems: vi.fn<() => Subject<SignalingProblem>>(),
  offers: vi.fn<() => Subject<ConnectionOffer>>(),
  links: vi.fn<() => BehaviorSubject<readonly LinkView[]>>()
}));
const device = vi.hoisted(() => ({
  ensureDevice: vi.fn<() => Promise<{ id: string; name: string }>>()
}));
const envelopeApi = vi.hoisted(() => ({
  writeEnvelopes: vi.fn<typeof writeEnvelopes>(),
  envelopeFor: vi.fn<
    () => Promise<{
      readonly kid: string;
      readonly epk: string;
      readonly iv: string;
      readonly ct: string;
      readonly tag: string;
    } | null>
  >()
}));
const deviceKeys = vi.hoisted(() => ({
  ensureDeviceKeyPair: vi.fn<() => Promise<{ publicKeyBase64: string; privateKeyJwk: JsonWebKey }>>()
}));
const teamKeys = vi.hoisted(() => ({
  teamDeviceKeys: vi.fn<() => Promise<readonly { deviceId: string; publicKeyBase64: string | null }[]>>()
}));
vi.mock('@aiao/rxdb-plugin-p2p', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-p2p')>()),
  P2PFileManifestEntity: class {
    static findAll = persistence.findAll;
    save(): Promise<void> {
      return persistence.save(this as unknown as P2PFileManifestEntity);
    }
    remove(): Promise<void> {
      return persistence.remove(this as unknown as P2PFileManifestEntity);
    }
  }
}));
vi.mock('./held-files', async importOriginal => ({
  ...(await importOriginal<typeof import('./held-files')>()),
  HeldFiles: class {
    createWriter = storage.createWriter;
    store = storage.store;
    open = storage.open;
    remove = storage.remove;
  }
}));
vi.mock('../db/p2p-database', () => ({
  LOCAL_ADAPTER: 'local',
  REMOTE_ADAPTER: 'remote',
  createP2PDatabase: () => ({
    connect: persistence.connect,
    syncManager: { pull: async () => undefined, push: persistence.push },
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  })
}));
vi.mock('../device/device-registration', () => ({
  defaultDeviceName: () => '本机',
  ensureDevice: device.ensureDevice
}));
vi.mock('../device/device-keys', () => ({
  ensureDeviceKeyPair: deviceKeys.ensureDeviceKeyPair
}));
vi.mock('../device/team-device-keys', () => ({
  teamDeviceKeys: teamKeys.teamDeviceKeys
}));
vi.mock('../device/fallback-envelopes', () => ({
  writeEnvelopes: envelopeApi.writeEnvelopes,
  envelopeFor: envelopeApi.envelopeFor
}));
// 密码学行为有它自己的 spec（fallback-crypto.spec.ts）；工作区 spec 只验证接线，不重复跑 WebCrypto。
vi.mock('./fallback-crypto', () => ({
  encodeEncryptedBlob: vi.fn(
    async (
      _key: unknown,
      shape: { readonly size: number; readonly chunkSize: number },
      readChunk: (offset: number, size: number) => Promise<Uint8Array>
    ) => {
      const parts: BlobPart[] = [];
      for (let offset = 0; offset < shape.size; offset += shape.chunkSize) {
        const chunk = await readChunk(offset, Math.min(shape.chunkSize, shape.size - offset));
        const encrypted = new Uint8Array(new ArrayBuffer(chunk.byteLength + 1));
        encrypted[0] = 0xec;
        encrypted.set(chunk, 1);
        parts.push(encrypted);
      }
      return new Blob(parts, { type: 'application/octet-stream' });
    }
  ),
  sha256Hex: vi.fn(async () => 'e'.repeat(64)),
  fallbackEncUrl: (hash: string) => `/api/files/enc/${hash}`,
  generateContentKey: vi.fn(async () => ({ type: 'secret' })),
  sealContentKey: vi.fn(async () => ({ kid: 'p256-1', epk: 'epk', iv: 'iv', ct: 'ct', tag: 'tag' })),
  openContentKey: vi.fn(async () => ({ type: 'secret' })),
  importDevicePrivateKey: vi.fn(async () => ({ type: 'private' })),
  decodeEncryptedStream: vi.fn((_key: unknown, _shape: unknown, source: ReadableStream<Uint8Array>) => source),
  isEncryptedFallbackUrl: (url: string) => url.includes('/api/files/enc/'),
  FALLBACK_ENCODING_HEADER: 'x-pool-fallback-encoding',
  FALLBACK_ENCODING_VERSION: '1'
}));
vi.mock('./peer-links', () => ({
  PeerLinks: class {
    links$ = network.links();
    connect = network.connect;
    disconnect = network.disconnect;
    start = vi.fn();
    constructor(options: PeerLinksOptions) {
      network.peerOptions(options);
    }
  }
}));
vi.mock('./signaling-client', () => ({
  SignalingClient: class {
    state$ = network.state();
    peers$ = network.presence();
    errors$ = network.problems();
    connections$ = network.offers();
    start = vi.fn();
    constructor(options: SignalingClientOptions) {
      network.signalOptions(options);
    }
  }
}));

const file = (hash: string): SharedFileView => ({
  contentHash: hash,
  manifest: {
    id: 'manifest',
    holderId: 'holder',
    updatedAt: 1,
    contentHash: hash,
    fileName: 'report.pdf',
    size: 1,
    chunkSize: 1,
    chunkHashes: ['b'.repeat(64)]
  },
  holders: [],
  holderViews: [],
  heldHere: false,
  onlineSources: 0,
  serverCopy: true
});

const localPrincipal: P2PPrincipal = { principal: 'user', deviceId: 'local-device' };
const remotePrincipal: P2PPrincipal = { principal: 'remote-user', deviceId: 'remote-device' };
const peer: SignalingPeer = {
  key: 'remote-instance',
  principal: remotePrincipal.principal,
  deviceId: remotePrincipal.deviceId,
  userName: '对方',
  deviceName: '书房电脑'
};
const writer = {
  write: vi.fn<HeldFileWriter['write']>(),
  commit: vi.fn<HeldFileWriter['commit']>(),
  discard: vi.fn<HeldFileWriter['discard']>()
};
const auth = {
  session: vi.fn<() => { user: { id: string } } | null>(),
  accessToken: vi.fn<() => Promise<string>>(),
  client: {}
};
const fetcher = vi.fn<typeof fetch>();
let rows: BehaviorSubject<P2PFileManifestEntity[]>;
let presence: BehaviorSubject<readonly SignalingPeer[]>;
let signalingState: BehaviorSubject<SignalingState>;
let problems: Subject<SignalingProblem>;
let offers: Subject<ConnectionOffer>;
let links: BehaviorSubject<readonly LinkView[]>;
const held = new Map<string, File>();

const prepareWorkspace = (): P2PWorkspace => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  held.clear();
  rows = new BehaviorSubject<P2PFileManifestEntity[]>([]);
  presence = new BehaviorSubject<readonly SignalingPeer[]>([]);
  signalingState = new BehaviorSubject<SignalingState>('online');
  problems = new Subject<SignalingProblem>();
  offers = new Subject<ConnectionOffer>();
  links = new BehaviorSubject<readonly LinkView[]>([]);
  persistence.findAll.mockReturnValue(rows);
  persistence.connect.mockResolvedValue();
  persistence.push.mockResolvedValue();
  persistence.save.mockImplementation(async row => {
    rows.next([...rows.value.filter(item => item.id !== row.id), row]);
  });
  persistence.remove.mockImplementation(async row => {
    rows.next(rows.value.filter(item => item.id !== row.id));
  });
  network.presence.mockReturnValue(presence);
  network.state.mockReturnValue(signalingState);
  network.problems.mockReturnValue(problems);
  network.offers.mockReturnValue(offers);
  network.links.mockReturnValue(links);
  device.ensureDevice.mockResolvedValue({ id: 'local-device', name: '本机' });
  deviceKeys.ensureDeviceKeyPair.mockResolvedValue({ publicKeyBase64: 'pub-key', privateKeyJwk: { kty: 'EC' } });
  teamKeys.teamDeviceKeys.mockResolvedValue([{ deviceId: 'other-device', publicKeyBase64: 'other-pub' }]);
  envelopeApi.writeEnvelopes.mockResolvedValue();
  envelopeApi.envelopeFor.mockResolvedValue(null);
  auth.session.mockReturnValue({ user: { id: 'user' } });
  auth.accessToken.mockResolvedValue('access-token');
  storage.store.mockImplementation(async (hash, file) => {
    held.set(hash, file);
  });
  storage.open.mockImplementation(async hash => held.get(hash) ?? null);
  storage.remove.mockImplementation(async hash => {
    held.delete(hash);
  });
  writer.write.mockResolvedValue();
  writer.commit.mockResolvedValue();
  writer.discard.mockResolvedValue();
  storage.createWriter.mockResolvedValue(writer);
  fetcher.mockImplementation(async url => {
    // 工作区启动会查询激活状态（/api/me）；其余请求保持「服务不可用」的默认
    if (String(url).includes('/api/me')) {
      return new Response(JSON.stringify({ activated: true }), { status: 200 });
    }
    return new Response('unavailable', { status: 503 });
  });
  vi.stubGlobal('fetch', fetcher);
  TestBed.configureTestingModule({ providers: [P2PWorkspace, { provide: AuthService, useValue: auth }] });
  return TestBed.inject(P2PWorkspace);
};

const cleanUp = (): void => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  TestBed.resetTestingModule();
};

const recordFor = async (content: File, principal = remotePrincipal, server = false): Promise<P2PManifestRecord> => {
  const manifest = await createAuthenticatedP2PFileManifest({
    principal,
    fileName: content.name,
    size: content.size,
    chunkSize: 2,
    readChunk: async (offset, size) => new Uint8Array(await content.slice(offset, offset + size).arrayBuffer())
  });
  return createManifestRecord(
    { ...manifest, ...(server ? { sourceUrl: `/api/files/${manifest.contentHash}` } : {}) },
    { principal }
  );
};
const addRecord = (record: P2PManifestRecord): void => {
  rows.next([...rows.value, Object.assign(new P2PFileManifestEntity(), toRxDBManifestDocument(record))]);
};
const readyLink = (): LinkView => ({
  connectionId: 'connection',
  peer,
  role: 'initiator',
  state: 'ready',
  closeCode: null,
  protocols: ['p2p.files'],
  totals: { sent: 0, received: 0, bytesSent: 0, bytesReceived: 0 },
  frames: []
});

describe('P2PWorkspace download controls', () => {
  let workspace: P2PWorkspace;
  beforeEach(() => {
    workspace = prepareWorkspace();
    vi.spyOn(workspace, 'files').mockReturnValue([file('a'.repeat(64)), file('c'.repeat(64))]);
  });
  afterEach(cleanUp);

  it('cancels while a peer is still connecting and handles its later rejection', async () => {
    await workspace.start();
    const hash = 'a'.repeat(64);
    const peer = {
      key: 'peer',
      principal: 'other-user',
      userName: '对方',
      deviceId: 'other-device',
      deviceName: '另一台电脑'
    };
    vi.mocked(workspace.files).mockReturnValue([
      {
        ...file(hash),
        serverCopy: false,
        onlineSources: 1,
        holderViews: [{ holderId: 'holder', mine: false, label: peer.deviceName, online: [peer] }]
      }
    ]);
    let rejectConnection!: (error: Error) => void;
    network.connect.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectConnection = reject;
      })
    );
    const listen = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const unlisten = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    let completed = false;
    const active = workspace.download(hash).then(() => {
      completed = true;
    });
    await vi.advanceTimersByTimeAsync(250);
    const running = workspace.transfers()[0]!;
    expect(running.state).toBe('running');
    workspace.cancel(running.id);
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(completed).toBe(true);
      expect(workspace.downloadingHashes().size).toBe(0);
      expect(storage.createWriter).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(250);
      expect(workspace.transfers()).toMatchObject([{ id: running.id, state: 'cancelled' }]);
      const listener = listen.mock.calls.find(([type]) => type === 'abort')?.[1];
      expect(listener).toBeDefined();
      expect(unlisten).toHaveBeenCalledWith('abort', listener);
    } finally {
      rejectConnection(new Error('连接稍后超时'));
      await active;
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.transfers()).toMatchObject([{ id: running.id, state: 'cancelled' }]);
  });

  it('prevents simultaneous writes for the same file and allows retry after a storage failure', async () => {
    let fail!: (error: Error) => void;
    storage.createWriter.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    const hash = 'a'.repeat(64);
    const first = workspace.download(hash);
    await workspace.download(hash);
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.downloadingHashes().has(hash)).toBe(true);
    expect(storage.createWriter).toHaveBeenCalledTimes(1);
    fail(new Error('磁盘空间不足'));
    await first;
    await vi.advanceTimersByTimeAsync(250);
    expect(workspace.downloadingHashes().size).toBe(0);
    expect(workspace.transfers()).toMatchObject([{ state: 'failed', error: '磁盘空间不足' }]);
    storage.createWriter.mockRejectedValueOnce(new Error('磁盘空间不足'));
    await workspace.download(hash);
    expect(storage.createWriter).toHaveBeenCalledTimes(2);
  });

  it('clears only finished history and keeps an active download cancellable', async () => {
    let fail!: (error: Error) => void;
    storage.createWriter.mockRejectedValueOnce(new Error('磁盘空间不足'));
    await workspace.download('a'.repeat(64));
    storage.createWriter.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    const active = workspace.download('c'.repeat(64));
    await vi.advanceTimersByTimeAsync(250);
    const running = workspace.transfers().find(item => item.state === 'running')!;
    workspace.clearFinishedTransfers();
    expect(workspace.transfers()).toMatchObject([{ id: running.id, state: 'running' }]);
    workspace.cancel(running.id);
    fail(new Error('写入已取消'));
    await active;
    await vi.advanceTimersByTimeAsync(250);
    expect(workspace.transfers()).toMatchObject([{ id: running.id, state: 'cancelled' }]);
    workspace.clearFinishedTransfers();
    expect(workspace.transfers()).toEqual([]);
  });
});

describe('P2PWorkspace file lifecycle', () => {
  let workspace: P2PWorkspace;
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const content = (): File => new File([bytes], '相册.bin');
  beforeEach(() => {
    workspace = prepareWorkspace();
  });
  afterEach(cleanUp);

  it('requires authentication and reports startup failures without retrying partial initialization', async () => {
    expect(workspace.myHolderId()).toBeNull();
    await expect(workspace.share(content(), false)).rejects.toThrow('workspace has not started');
    await expect(workspace.connect(peer.key)).rejects.toThrow('workspace has not started');
    auth.session.mockReturnValue(null);
    const first = workspace.start();
    expect(workspace.start()).toBe(first);
    await expect(first).rejects.toThrow('not signed in');
    expect(workspace.phase()).toBe('failed');
    expect(workspace.startError()).toBe('not signed in');
    expect(persistence.connect).not.toHaveBeenCalled();
  });

  it('retains the cause of a database startup failure for troubleshooting', async () => {
    persistence.connect.mockRejectedValue(new Error('本地库无法打开', { cause: new Error('磁盘已满') }));
    await expect(workspace.start()).rejects.toThrow('本地库无法打开');
    expect(workspace.startError()).toBe('本地库无法打开：磁盘已满');
  });

  it('registers the device while the local database is still connecting', async () => {
    let resolveDevice!: (device: { id: string; name: string }) => void;
    device.ensureDevice.mockReturnValue(
      new Promise(resolve => {
        resolveDevice = resolve;
      })
    );
    let resolveConnect!: () => void;
    persistence.connect.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveConnect = resolve;
        })
    );
    const starting = workspace.start();
    await vi.advanceTimersByTimeAsync(0);
    // 本地库连接已开始、设备登记尚未完成——两者并行，登记往返不占启动时间。
    expect(persistence.connect).toHaveBeenCalledWith('local');
    expect(workspace.device()).toBeNull();
    resolveDevice({ id: 'local-device', name: '本机' });
    await vi.advanceTimersByTimeAsync(0);
    expect(workspace.device()).toEqual({ id: 'local-device', name: '本机' });
    resolveConnect();
    await starting;
    expect(workspace.phase()).toBe('ready');
  });

  it('publishes a real local file only after storing it and keeps repeat sharing idempotent', async () => {
    await workspace.start();
    expect(workspace.phase()).toBe('ready');
    const selected = content();
    await workspace.share(selected, false);
    const shared = workspace.files()[0]!;
    expect(shared.heldHere).toBe(true);
    expect(shared.holderViews).toMatchObject([{ mine: true, label: '本机' }]);
    expect(held.get(shared.contentHash)).toBe(selected);
    expect(shared.serverCopy).toBe(false);
    expect(shared.manifest.holderId).toBe(deriveHolderId(localPrincipal));
    expect(fetcher.mock.calls.filter(([url]) => !String(url).includes('/api/me'))).toEqual([]);
    await workspace.share(selected, false);
    expect(workspace.files()).toHaveLength(1);
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(persistence.push).toHaveBeenCalledTimes(2);
  });

  it('encrypts an opted-in server copy before uploading it, seals envelopes, and advertises the ciphertext URL', async () => {
    await workspace.start();
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    const selected = content();
    await workspace.share(selected, true);
    const shared = workspace.files()[0]!;
    const encUrl = `/api/files/enc/${'e'.repeat(64)}`;
    expect(shared.serverCopy).toBe(true);
    expect(shared.manifest.sourceUrl).toBe(encUrl);
    const uploadCall = fetcher.mock.calls.find(
      ([url, init]) => String(url) === encUrl && (init as RequestInit).method === 'PUT'
    )!;
    const [url, init] = uploadCall;
    expect(url).toBe(encUrl);
    expect(init).toMatchObject({
      method: 'PUT',
      headers: { authorization: 'Bearer access-token', 'content-type': 'application/octet-stream' }
    });
    // 上传的是密文（mock 给每块加了 0xec 前缀），不是原文件
    const uploaded = new Uint8Array(await new Response(init!.body as BodyInit).arrayBuffer());
    expect(uploaded.byteLength).toBe(selected.size + 1);
    expect(uploaded[0]).toBe(0xec);
    // 给团队里每台登记了公钥的设备都封装了信封，直写 Supabase
    expect(envelopeApi.writeEnvelopes).toHaveBeenCalledTimes(1);
    expect(envelopeApi.writeEnvelopes.mock.calls[0]![1]).toMatchObject([
      { contentHash: shared.contentHash, recipientDeviceId: 'other-device', kid: 'p256-1' }
    ]);
  });

  it('does not advertise a file when its requested server copy fails', async () => {
    await workspace.start();
    fetcher.mockResolvedValueOnce(new Response('服务器空间不足', { status: 507 }));
    await expect(workspace.share(content(), true)).rejects.toThrow('encrypted upload failed (507): 服务器空间不足');
    expect(workspace.files()).toEqual([]);
    expect(persistence.save).not.toHaveBeenCalled();
    expect(envelopeApi.writeEnvelopes).not.toHaveBeenCalled();
  });

  it('creates a usable example file that follows the same sharing path', async () => {
    await workspace.start();
    await workspace.generateTestFile(1, false);
    const shared = workspace.files()[0]!;
    expect(shared.manifest.size).toBe(1024 * 1024);
    expect(shared.manifest.fileName).toMatch(/^random-1MiB-.*\.bin$/);
    expect(held.get(shared.contentHash)?.size).toBe(1024 * 1024);
    expect(shared.heldHere).toBe(true);
  });

  it('removes only the local holder and local bytes while retaining another device’s copy', async () => {
    await workspace.start();
    const selected = content();
    await workspace.share(selected, false);
    const shared = workspace.files()[0]!;
    addRecord(await recordFor(selected));
    await workspace.revoke(shared.contentHash);
    expect(workspace.files()).toHaveLength(1);
    expect(workspace.files()[0]?.heldHere).toBe(false);
    expect(workspace.files()[0]?.holderViews).toHaveLength(1);
    expect(held.has(shared.contentHash)).toBe(false);
    await expect(workspace.revoke(shared.contentHash)).rejects.toThrow('this device does not hold the file');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it('saves the requested file through the browser and releases its object URL later', async () => {
    await workspace.start();
    await workspace.share(content(), false);
    const shared = workspace.files()[0]!;
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:saved-file');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let savedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      savedName = this.download;
    });
    await workspace.saveToDisk(shared.contentHash, '导出.bin');
    expect(savedName).toBe('导出.bin');
    expect(createUrl).toHaveBeenCalledWith(held.get(shared.contentHash));
    expect(revokeUrl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:saved-file');
    await expect(workspace.saveToDisk('missing', 'missing.bin')).rejects.toThrow('not stored on this device');
  });

  it('keeps an established source reachable when discovery goes offline and remembers its label', async () => {
    await workspace.start();
    const record = await recordFor(content());
    addRecord(record);
    expect(workspace.files()[0]?.holderViews[0]?.label).toBe('其他设备');
    expect(workspace.files()[0]?.onlineSources).toBe(0);
    presence.next([peer]);
    expect(workspace.files()[0]?.onlineSources).toBe(1);
    expect(workspace.files()[0]?.holderViews[0]?.label).toBe('书房电脑');
    links.next([readyLink()]);
    presence.next([]);
    expect(workspace.reachable()).toEqual([peer]);
    expect(workspace.files()[0]?.onlineSources).toBe(1);
    links.next([{ ...readyLink(), state: 'closed', closeCode: 'peer_closed' }]);
    expect(workspace.files()[0]?.onlineSources).toBe(0);
    expect(workspace.files()[0]?.holderViews[0]?.label).toBe('书房电脑');
  });

  it('uses registered identity for reconnections and delegates explicit connect and disconnect actions', async () => {
    await workspace.start();
    const options = network.signalOptions.mock.calls[0]![0];
    await expect(options.credentials()).resolves.toEqual({
      accessToken: 'access-token',
      deviceId: 'local-device',
      instanceId: workspace.instanceId
    });
    network.connect.mockResolvedValue({} as P2PPeerSession);
    await workspace.connect(peer.key);
    workspace.disconnect('connection');
    expect(network.connect).toHaveBeenCalledWith(peer.key);
    expect(network.disconnect).toHaveBeenCalledWith('connection');
  });

  it('serves verified local bytes, denies unauthorized sharing, and refuses missing local content', async () => {
    await workspace.start();
    await workspace.share(content(), false);
    const shared = workspace.files()[0]!;
    const protocol = network.peerOptions.mock.calls[0]![0].protocols()[0]!;
    const request = {
      method: 'read',
      params: { contentHash: shared.contentHash, offset: 0, size: 4 },
      payload: new Uint8Array(),
      peer: { principal: remotePrincipal, instanceId: peer.key },
      signal: new AbortController().signal
    };
    await expect(protocol.handle(request)).resolves.toMatchObject({ payload: bytes });
    workspace.setFaults({ deny: true });
    await expect(protocol.handle(request)).rejects.toMatchObject({ code: 'unauthorized' });
    workspace.setFaults({ deny: false, corrupt: true, delayMs: 50 });
    const corrupted = protocol.handle(request);
    await vi.advanceTimersByTimeAsync(50);
    await expect(corrupted).resolves.toMatchObject({ payload: new Uint8Array([254, 2, 3, 4]) });
    held.set(shared.contentHash, new File(['x'], 'truncated.bin'));
    await expect(protocol.handle(request)).rejects.toMatchObject({ code: 'not_holder' });
    await expect(
      protocol.handle({ ...request, params: { contentHash: 'missing', offset: 0, size: 1 } })
    ).rejects.toMatchObject({ code: 'not_holder' });
  });

  it('downloads verified server bytes, commits them, and advertises this device as a new holder', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord(record);
    fetcher.mockResolvedValueOnce(new Response(bytes));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(writer.write.mock.calls).toEqual([
      [0, bytes.slice(0, 2)],
      [2, bytes.slice(2, 4)]
    ]);
    expect(writer.commit).toHaveBeenCalledOnce();
    expect(writer.discard).not.toHaveBeenCalled();
    expect(workspace.files()[0]?.heldHere).toBe(true);
    expect(workspace.transfers()).toMatchObject([{ state: 'done', route: 'server', bytes: 4 }]);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/files/${record.contentHash}`,
      expect.objectContaining({ headers: { authorization: 'Bearer access-token' } })
    );
  });

  it('decrypts an encrypted server copy with this device envelope before chunk verification', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord({ ...record, sourceUrl: `/api/files/enc/${'e'.repeat(64)}` });
    envelopeApi.envelopeFor.mockResolvedValue({ kid: 'p256-1', epk: 'epk', iv: 'iv', ct: 'ct', tag: 'tag' });
    fetcher.mockResolvedValueOnce(new Response(bytes));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/files/enc/${'e'.repeat(64)}`,
      expect.objectContaining({
        headers: { authorization: 'Bearer access-token', 'x-pool-fallback-encoding': '1' }
      })
    );
    expect(writer.commit).toHaveBeenCalledOnce();
    expect(writer.discard).not.toHaveBeenCalled();
    expect(workspace.transfers()).toMatchObject([{ state: 'done', route: 'server', bytes: 4 }]);
  });

  it('fails an encrypted server download with a clear error when this device has no envelope', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord({ ...record, sourceUrl: `/api/files/enc/${'e'.repeat(64)}` });
    envelopeApi.envelopeFor.mockResolvedValue(null);
    fetcher.mockResolvedValueOnce(new Response(bytes));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(writer.discard).toHaveBeenCalledOnce();
    expect(writer.commit).not.toHaveBeenCalled();
    expect(workspace.transfers()).toMatchObject([{ state: 'failed', error: expect.stringContaining('没有解密信封') }]);
  });

  it('keeps a verified download it could not register and says that registration failed', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord(record);
    fetcher.mockResolvedValueOnce(new Response(bytes));
    persistence.save.mockRejectedValueOnce(new Error('本地库写入失败'));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(writer.commit).toHaveBeenCalledOnce();
    expect(writer.discard).not.toHaveBeenCalled();
    expect(workspace.files()[0]?.heldHere).toBe(false);
    expect(workspace.transfers()).toMatchObject([
      { state: 'failed', bytes: 4, error: '文件已下载并通过校验，但登记本机持有失败：本地库写入失败' }
    ]);
  });

  it('counts each chunk once and credits the server for the chunks it rewrote after the peer failed', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord(record);
    presence.next([peer]);
    const request = vi.fn<P2PPeerSession['request']>(async (_protocol, call) => {
      const range = call.params as { offset: number; size: number };
      if (range.offset > 0) throw new Error('对端断开');
      return { result: null, payload: bytes.slice(range.offset, range.offset + range.size) };
    });
    network.connect.mockResolvedValue({ request } as unknown as P2PPeerSession);
    fetcher.mockResolvedValueOnce(new Response(bytes));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(request).toHaveBeenCalled();
    expect(workspace.transfers()).toMatchObject([
      { state: 'done', route: 'server', bytes: 4, chunks: ['server', 'server'], sources: ['书房电脑'] }
    ]);
  });

  it('keeps the latest signaling problem until signaling is online again or assigns a connection', async () => {
    await workspace.start();
    expect(workspace.signalingError()).toBeNull();
    const unavailable: SignalingProblem = { code: 'peer_unavailable', message: 'remote-instance is not online' };
    problems.next(unavailable);
    expect(workspace.signalingError()).toEqual(unavailable);
    offers.next({ type: 'connection', connectionId: 'connection', role: 'responder', peer, ticket: 'ticket' });
    expect(workspace.signalingError()).toBeNull();
    problems.next({ code: 'server_error', message: 'authentication host unavailable' });
    signalingState.next('offline');
    expect(workspace.signalingError()).toMatchObject({ code: 'server_error' });
    signalingState.next('online');
    expect(workspace.signalingError()).toBeNull();
  });

  it('discards a failed server download and does not announce a new local holder', async () => {
    await workspace.start();
    const record = await recordFor(content(), remotePrincipal, true);
    addRecord(record);
    fetcher.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(writer.commit).not.toHaveBeenCalled();
    expect(writer.discard).toHaveBeenCalledOnce();
    expect(workspace.files()[0]?.heldHere).toBe(false);
    expect(workspace.transfers()[0]?.state).toBe('failed');
    expect(workspace.transfers()[0]?.error).toContain('404');
  });

  it('downloads directly from a connected peer without requesting a server copy', async () => {
    await workspace.start();
    const record = await recordFor(content());
    addRecord(record);
    presence.next([peer]);
    const request = vi.fn<P2PPeerSession['request']>(async (_protocol, call) => {
      const range = call.params as { offset: number; size: number };
      return { result: null, payload: bytes.slice(range.offset, range.offset + range.size) };
    });
    network.connect.mockResolvedValue({ request } as unknown as P2PPeerSession);
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(request).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.filter(([url]) => !String(url).includes('/api/me'))).toEqual([]);
    expect(writer.commit).toHaveBeenCalledOnce();
    expect(workspace.transfers()).toMatchObject([{ state: 'done', route: 'p2p', sources: ['书房电脑'] }]);
  });

  it('reports an unavailable source before opening a local writer', async () => {
    await workspace.start();
    const record = await recordFor(content());
    addRecord(record);
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(workspace.transfers()[0]?.error).toContain('没有在线的持有者');
    presence.next([peer]);
    network.connect.mockRejectedValue(new Error('连接被拒绝', { cause: new Error('对端离线') }));
    await workspace.download(record.contentHash);
    await vi.advanceTimersByTimeAsync(250);
    expect(workspace.transfers()[0]?.error).toContain('连接被拒绝：对端离线');
    expect(storage.createWriter).not.toHaveBeenCalled();
    await expect(workspace.download('missing')).rejects.toThrow('unknown file');
  });
});
