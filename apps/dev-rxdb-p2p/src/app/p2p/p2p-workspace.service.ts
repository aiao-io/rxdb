/**
 * P2P 工作区：把登录用户的设备、本地库与同步、信令、对端会话、本机文件与下载串起来，交给页面一组 signal。
 *
 * @remarks
 * - 持有声明是清单实体（P2P 插件登记），经 rxdb-plugin-sync 与 Supabase 同步；字节只走 P2P 会话或服务器回退。
 * - 本机「持有」以本设备的清单记录为准，字节在 OPFS（{@link HeldFiles}）。
 * - 故障注入只影响本机作为供块端的行为，用来演示授权拒绝、坏块隔离与慢源调度。
 */
import {
  createAuthenticatedP2PFileManifest,
  createManifestRecord,
  createP2PFilesProtocol,
  createP2PFilesSource,
  deriveHolderId,
  downloadP2PFile,
  P2PFileManifestEntity,
  toRxDBManifestDocument,
  type P2PFileManifest,
  type P2PLocalContent,
  type P2PManifestRecord,
  type P2PPrincipal,
  type P2PProtocol,
  type P2PServerFallback
} from '@aiao/rxdb-plugin-p2p';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { SignalingPeer } from '../../../shared/signaling-protocol';
import { AuthService } from '../auth/auth.service';
import { groupSharedFiles, recordOf, type SharedFile } from '../db/manifest-records';
import { ManifestSync, type ManifestSyncTarget, type SyncStatus } from '../db/manifest-sync';
import { createP2PDatabase, LOCAL_ADAPTER, REMOTE_ADAPTER } from '../db/p2p-database';
import { defaultDeviceName, ensureDevice, type RegisteredDevice } from '../device/device-registration';
import { supabaseDeviceApi } from '../device/supabase-device-api';
import { HeldFiles, readRange } from './held-files';
import { PeerLinks, type LinkView } from './peer-links';
import { SignalingClient, type SignalingState } from './signaling-client';
import { TransferProgress, type TransferView } from './transfer-progress';

/** 共享文件的一个持有者。 */
export interface HolderView {
  readonly holderId: string;
  /** 本设备。 */
  readonly mine: boolean;
  /** 设备名；没在线见过的设备只显示 holderId 前缀。 */
  readonly label: string;
  /** 这台设备当前在线的实例。 */
  readonly online: readonly SignalingPeer[];
}

/** 页面上的一个共享文件。 */
export interface SharedFileView extends SharedFile {
  readonly holderViews: readonly HolderView[];
  /** 本设备持有。 */
  readonly heldHere: boolean;
  /** 可以直连取块的在线持有实例数。 */
  readonly onlineSources: number;
}

/** 本机作为供块端的故障注入。 */
export interface DemoFaults {
  /** 拒绝授权：对端的块请求得到 `unauthorized`，会话不断。 */
  readonly deny: boolean;
  /** 篡改块：每块首字节取反，对端校验失败后隔离本机。 */
  readonly corrupt: boolean;
  /** 每块读盘前延迟（毫秒），演示多源调度向快的一方倾斜。 */
  readonly delayMs: number;
}

/** 工作区启动阶段。 */
export type WorkspacePhase = 'idle' | 'starting' | 'ready' | 'failed';

const HEARTBEAT_INTERVAL_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 6000;
const TRANSFER_EMIT_MS = 200;
const RANDOM_FILL_LIMIT = 65_536;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const fileUrl = (contentHash: string): string => `/api/files/${contentHash}`;

const bareManifest = (manifest: P2PFileManifest, sourceUrl: string | undefined): P2PFileManifest => ({
  contentHash: manifest.contentHash,
  fileName: manifest.fileName,
  size: manifest.size,
  chunkSize: manifest.chunkSize,
  chunkHashes: [...manifest.chunkHashes],
  ...(sourceUrl ? { sourceUrl } : {})
});

/** P2P 工作区。 */
@Injectable({ providedIn: 'root' })
export class P2PWorkspace {
  readonly #auth = inject(AuthService);
  readonly #held = new HeldFiles();
  readonly #principal = signal<P2PPrincipal | null>(null);
  readonly #records = signal<readonly P2PManifestRecord[]>([]);
  readonly #entities = new Map<string, P2PFileManifestEntity>();
  readonly #knownLabels = new Map<string, string>();
  readonly #holderIds = new Map<string, string>();
  readonly #transfers = new Map<string, { readonly progress: TransferProgress; readonly controller: AbortController }>();
  readonly #serverFallback: P2PServerFallback = {
    download: async ({ manifest, signal, token }) => {
      const response = await fetch(fileUrl(manifest.contentHash), { headers: { authorization: `Bearer ${token}` }, signal });
      if (!response.ok || !response.body) throw new Error(`server fallback responded ${response.status}`);
      return response.body;
    }
  };
  #starting: Promise<void> | null = null;
  #sync: ManifestSync | null = null;
  #links: PeerLinks | null = null;
  #transferTimer: ReturnType<typeof setTimeout> | undefined;

  /** 本页面这个运行实例的标识。 */
  readonly instanceId = crypto.randomUUID();
  readonly phase = signal<WorkspacePhase>('idle');
  readonly startError = signal<string | null>(null);
  readonly device = signal<RegisteredDevice | null>(null);
  readonly signalingState = signal<SignalingState>('offline');
  readonly peers = signal<readonly SignalingPeer[]>([]);
  readonly links = signal<readonly LinkView[]>([]);
  readonly sync = signal<SyncStatus>({ phase: 'idle', error: null, lastSyncedAt: null });
  readonly transfers = signal<readonly TransferView[]>([]);
  readonly faults = signal<DemoFaults>({ deny: false, corrupt: false, delayMs: 0 });

  /** 本设备的 holderId。 */
  readonly myHolderId = computed(() => {
    const principal = this.#principal();
    return principal ? deriveHolderId(principal) : null;
  });

  /** 共享文件，最新的在前。 */
  readonly files = computed<readonly SharedFileView[]>(() => {
    const peers = this.peers();
    const mine = this.myHolderId();
    return groupSharedFiles(this.#records()).map(file => this.#fileView(file, peers, mine));
  });

  /** 启动工作区（可重复调用）。 */
  start(): Promise<void> {
    this.#starting ??= this.#start().catch((error: unknown) => {
      this.phase.set('failed');
      this.startError.set(messageOf(error));
      throw error;
    });
    return this.#starting;
  }

  /** 共享一个本地文件；`upload` 时同时传到服务器作为回退。 */
  async share(file: File, upload: boolean): Promise<void> {
    const manifest = await createAuthenticatedP2PFileManifest({
      principal: this.#requirePrincipal(),
      fileName: file.name,
      size: file.size,
      readChunk: (offset, size) => readRange(file, offset, size)
    });
    await this.#held.store(manifest.contentHash, file);
    const sourceUrl = upload ? await this.#upload(manifest.contentHash, file) : undefined;
    await this.#claim(manifest, sourceUrl);
  }

  /** 生成一个随机内容的测试文件并共享。 */
  generateTestFile(sizeMiB: number, upload: boolean): Promise<void> {
    const bytes = new Uint8Array(sizeMiB * 1024 * 1024);
    for (let offset = 0; offset < bytes.length; offset += RANDOM_FILL_LIMIT) {
      crypto.getRandomValues(bytes.subarray(offset, offset + RANDOM_FILL_LIMIT));
    }
    const name = `random-${sizeMiB}MiB-${Date.now().toString(36)}.bin`;
    return this.share(new File([bytes], name, { type: 'application/octet-stream' }), upload);
  }

  /** 下载一个共享文件：从全部在线持有者多源拉取，没有可用来源时回退服务器。 */
  async download(contentHash: string): Promise<void> {
    const file = this.files().find(item => item.contentHash === contentHash);
    if (!file) throw new Error(`unknown file ${contentHash}`);
    const peers = file.holderViews.filter(holder => !holder.mine).flatMap(holder => holder.online);
    const connected = await Promise.allSettled(peers.map(peer => this.#requireLinks().connect(peer.key)));
    const id = crypto.randomUUID();
    const labels = peers.map(peer => peer.deviceName);
    const progress = new TransferProgress(id, file.manifest, labels, Date.now, () => this.#emitTransfersSoon());
    const controller = new AbortController();
    this.#transfers.set(id, { progress, controller });
    this.#emitTransfersSoon();
    const sources = connected.flatMap((result, index) =>
      result.status === 'fulfilled' ? [progress.attribute(createP2PFilesSource(result.value, labels[index] as string))] : []
    );
    if (sources.length === 0 && !file.serverCopy) {
      const reasons = connected.flatMap(result => (result.status === 'rejected' ? [messageOf(result.reason)] : []));
      return progress.finish('failed', reasons.join('; ') || '没有在线的持有者，也没有服务器副本');
    }
    await this.#runDownload(file, progress, controller, sources);
  }

  /** 取消一次下载。 */
  cancel(transferId: string): void {
    this.#transfers.get(transferId)?.controller.abort(new Error('cancelled by user'));
  }

  /** 撤回本设备对某内容的持有声明，并删掉本机副本。 */
  async revoke(contentHash: string): Promise<void> {
    const mine = this.#records().find(record => record.contentHash === contentHash && record.holderId === this.myHolderId());
    const entity = mine ? this.#entities.get(mine.id) : undefined;
    if (!entity) throw new Error('this device does not hold the file');
    await entity.remove();
    await this.#held.remove(contentHash);
    await this.#requireSync().push();
  }

  /** 把本机持有的文件存到磁盘。 */
  async saveToDisk(contentHash: string, fileName: string): Promise<void> {
    const file = await this.#held.open(contentHash);
    if (!file) throw new Error('the file is not stored on this device');
    const url = URL.createObjectURL(file);
    const anchor = Object.assign(document.createElement('a'), { href: url, download: fileName });
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** 与一台在线设备建立会话。 */
  async connect(peerKey: string): Promise<void> {
    await this.#requireLinks().connect(peerKey);
  }

  /** 结束一条连接。 */
  disconnect(connectionId: string): void {
    this.#requireLinks().disconnect(connectionId);
  }

  /** 修改故障注入。 */
  setFaults(patch: Partial<DemoFaults>): void {
    this.faults.update(current => ({ ...current, ...patch }));
  }

  /** 演示心跳超时：卡住本页主线程，对端会在心跳超时内以 `peer_lost` 结束会话。 */
  freezeMainThread(ms: number): void {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      // 故意忙等：DataChannel 仍在，但本页不再应答心跳
    }
  }

  async #start(): Promise<void> {
    this.phase.set('starting');
    const session = this.#auth.session();
    if (!session) throw new Error('not signed in');
    const userId = session.user.id;
    const deviceApi = supabaseDeviceApi(this.#auth.client);
    const name = `${defaultDeviceName(navigator.userAgent)} #${crypto.randomUUID().slice(0, 4)}`;
    const device = await ensureDevice(userId, localStorage, deviceApi, name);
    this.device.set(device);
    this.#principal.set({ principal: userId, deviceId: device.id });
    const rxdb = createP2PDatabase(userId, this.#auth.client);
    await rxdb.connect(LOCAL_ADAPTER);
    await rxdb.connect(REMOTE_ADAPTER);
    this.#watchRecords();
    this.#startSync({
      pull: () => rxdb.syncManager.pull(),
      push: () => rxdb.syncManager.push(),
      addEventListener: (type, listener) => rxdb.addEventListener(type as never, listener as never),
      removeEventListener: (type, listener) => rxdb.removeEventListener(type as never, listener as never)
    });
    this.#startSignaling(device);
    this.phase.set('ready');
  }

  #watchRecords(): void {
    P2PFileManifestEntity.findAll({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'updatedAt', sort: 'desc' }]
    }).subscribe(rows => {
      this.#entities.clear();
      for (const row of rows) this.#entities.set(row.id, row);
      this.#records.set(rows.map(row => recordOf(row)).filter((record): record is P2PManifestRecord => record !== null));
    });
  }

  #startSync(target: ManifestSyncTarget): void {
    const sync = new ManifestSync(target, { intervalMs: 15_000, debounceMs: 150, now: Date.now });
    sync.status$.subscribe(status => this.sync.set(status));
    sync.start();
    this.#sync = sync;
  }

  #startSignaling(device: RegisteredDevice): void {
    const signaling = new SignalingClient({
      url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/signal`,
      credentials: async () => ({
        accessToken: await this.#auth.accessToken(),
        deviceId: device.id,
        instanceId: this.instanceId
      }),
      createSocket: url => new WebSocket(url),
      reconnectDelayMs: 2000
    });
    signaling.state$.subscribe(state => this.signalingState.set(state));
    signaling.peers$.subscribe(peers => this.#onPresence(peers));
    const links = new PeerLinks({
      signaling,
      local: { principal: this.#requirePrincipal(), instanceId: this.instanceId },
      protocols: () => [this.#filesProtocol()],
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      connectTimeoutMs: 10_000,
      createPeerConnection: () => new RTCPeerConnection({ iceServers: [] })
    });
    links.links$.subscribe(views => this.links.set(views));
    links.start();
    signaling.start();
    this.#links = links;
  }

  #onPresence(peers: readonly SignalingPeer[]): void {
    for (const peer of peers) this.#knownLabels.set(this.#holderIdOf(peer), peer.deviceName);
    this.peers.set(peers);
  }

  #holderIdOf(peer: SignalingPeer): string {
    const key = `${peer.principal}:${peer.deviceId}`;
    const known = this.#holderIds.get(key);
    if (known) return known;
    const holderId = deriveHolderId({ principal: peer.principal, deviceId: peer.deviceId });
    this.#holderIds.set(key, holderId);
    return holderId;
  }

  #fileView(file: SharedFile, peers: readonly SignalingPeer[], mine: string | null): SharedFileView {
    const holderViews = file.holders.map(record => {
      const online = peers.filter(peer => this.#holderIdOf(peer) === record.holderId);
      const isMine = record.holderId === mine;
      const label = isMine ? (this.device()?.name ?? '本设备') : (this.#knownLabels.get(record.holderId) ?? `${record.holderId.slice(7, 15)}…`);
      return { holderId: record.holderId, mine: isMine, label, online };
    });
    return {
      ...file,
      holderViews,
      heldHere: holderViews.some(holder => holder.mine),
      onlineSources: holderViews.filter(holder => !holder.mine).reduce((count, holder) => count + holder.online.length, 0)
    };
  }

  #filesProtocol(): P2PProtocol {
    return createP2PFilesProtocol({
      contents: contentHash => this.#localContent(contentHash),
      authorize: () => {
        if (this.faults().deny) throw new Error('this device has stopped sharing (demo: deny)');
      }
    });
  }

  async #localContent(contentHash: string): Promise<P2PLocalContent | undefined> {
    const mine = this.#records().find(record => record.contentHash === contentHash && record.holderId === this.myHolderId());
    if (!mine) return undefined;
    const file = await this.#held.open(contentHash);
    if (file?.size !== mine.size) return undefined;
    return { manifest: mine, readRange: (offset, size) => this.#serveRange(file, offset, size) };
  }

  async #serveRange(file: File, offset: number, size: number): Promise<Uint8Array> {
    const { delayMs, corrupt } = this.faults();
    if (delayMs > 0) await sleep(delayMs);
    const bytes = await readRange(file, offset, size);
    if (corrupt && bytes.byteLength > 0) bytes[0] = (bytes[0] as number) ^ 0xff;
    return bytes;
  }

  async #runDownload(
    file: SharedFileView,
    progress: TransferProgress,
    controller: AbortController,
    sources: ReturnType<TransferProgress['attribute']>[]
  ): Promise<void> {
    const writer = await this.#held.createWriter(file.contentHash);
    try {
      await downloadP2PFile({
        manifest: file.manifest,
        sources,
        fallback: file.serverCopy ? this.#serverFallback : undefined,
        token: await this.#auth.accessToken(),
        signal: controller.signal,
        writeChunk: async (index, bytes) => {
          await writer.write(index * file.manifest.chunkSize, bytes);
          progress.written(index, bytes.byteLength);
        },
        onProgress: ({ route }) => progress.switchRoute(route)
      });
      await writer.commit();
      await this.#claim(file.manifest, file.serverCopy ? fileUrl(file.contentHash) : undefined);
      progress.finish('done');
    } catch (error) {
      await writer.discard();
      progress.finish(controller.signal.aborted ? 'cancelled' : 'failed', messageOf(error));
    }
  }

  async #upload(contentHash: string, file: File): Promise<string> {
    const response = await fetch(fileUrl(contentHash), {
      method: 'PUT',
      body: file,
      headers: { authorization: `Bearer ${await this.#auth.accessToken()}`, 'content-type': 'application/octet-stream' }
    });
    if (!response.ok) throw new Error(`upload failed (${response.status}): ${await response.text()}`);
    return fileUrl(contentHash);
  }

  /** 登记本设备持有某内容；已登记过就只推送。 */
  async #claim(manifest: P2PFileManifest, sourceUrl: string | undefined): Promise<void> {
    const record = createManifestRecord(bareManifest(manifest, sourceUrl), { principal: this.#requirePrincipal() });
    if (!this.#entities.has(record.id)) {
      await Object.assign(new P2PFileManifestEntity(), toRxDBManifestDocument(record)).save();
    }
    await this.#requireSync().push();
  }

  #emitTransfersSoon(): void {
    if (this.#transferTimer !== undefined) return;
    this.#transferTimer = setTimeout(() => {
      this.#transferTimer = undefined;
      this.transfers.set([...this.#transfers.values()].map(({ progress }) => progress.view()).reverse());
    }, TRANSFER_EMIT_MS);
  }

  #requirePrincipal(): P2PPrincipal {
    const principal = this.#principal();
    if (!principal) throw new Error('workspace has not started');
    return principal;
  }

  #requireSync(): ManifestSync {
    if (!this.#sync) throw new Error('workspace has not started');
    return this.#sync;
  }

  #requireLinks(): PeerLinks {
    if (!this.#links) throw new Error('workspace has not started');
    return this.#links;
  }
}
