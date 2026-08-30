/**
 * @fileoverview panel 侧的 v2 数据面客户端：请求/应答、事件订阅与上传传输的驱动端。
 *
 * @remarks
 * 阶段 B 只交付了 connector 侧端点与 panel 侧**协商机**；数据面客户端被显式推迟到阶段 C
 * （见 `endpoint.ts` 头部）。本模块补上的就是那一半，它是 connector 端点的镜像，
 * 但两端的职责并不对称，有三处是刻意不对称的：
 *
 * 1. **ID 由 panel 铸造。** `requestId` / `transferId` 都从这里发出，因此额度判定必须
 *    发生在铸造与发帧**之前**：被拒的调用既不占额度也不上线。connector 侧的 `session.ts`
 *    做的是相反的事（准入对端送来的 ID），语义不同，不复用。
 * 2. **上传只报「已发出」，不报「已提交」。** 阶段 B 冻结的 wire 里，`TRANSFER_COMPLETE`
 *    成功时 connector **不发任何帧**（只有失败才发 `ERROR`）。因此本端能如实断言的最强结论
 *    就是 {@link DevToolsPanelUploadResult} 的 `'sent'`。把它叫成 `'ok'` 会让 UI 顺理成章地
 *    显示「上传成功」，而那句话此刻没有证据。缺一个提交回执是阶段 B 的协议缺口，
 *    记在 US-904 阶段 C 的保留项里，不在这里私自补一个新消息类型。
 * 3. **字节按需读取。** {@link DevToolsPanelUploadSource} 是 `read(offset, length)` 而不是一个
 *    `Uint8Array`，这样 renderer 侧全程只驻留一块 chunk——「不得把完整文件同时缓存」
 *    在 panel 这一端只能靠接口形状保证，靠纪律是保不住的。
 *
 * @module @aiao/rxdb-devtools/v2/panel-endpoint
 */

import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from '../provider/descriptor.js';
import { resolveNegotiatedTransferLimit } from '../provider/limits.js';
import type { DevToolsChunkSink } from '../provider/types.js';
import { SequenceGenerator } from '../sequence.js';
import type { DevToolsCapability } from '../types.js';
import { encodeCanonicalBase64 } from './base64.js';
import type { DevToolsClock } from './clock.js';
import {
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_REQUEST_TIMEOUT_MS
} from './constants.js';
import type { DevToolsErrorCode, DevToolsErrorPayload } from './errors.js';
import { createDevToolsError } from './errors.js';
import type {
  DevToolsPanelNegotiation,
  DevToolsPanelNegotiationMessage,
  DevToolsPanelNegotiationState
} from './negotiation-panel.js';
import { createPanelNegotiation } from './negotiation-panel.js';
import type { DevToolsTransferOutcome, DevToolsTransferResult, DevToolsTransferTable } from './transfer.js';
import { createDevToolsTransferTable } from './transfer.js';
import type {
  DevToolsEventPayload,
  DevToolsHandshakeCapabilities,
  DevToolsTransferStartPayload,
  DevToolsV2Direction,
  DevToolsV2Message,
  DevToolsV2MessageOptions
} from './wire.js';
import { createDevToolsV2Message, isDevToolsV2Message } from './wire.js';

/** 一次请求的结果；**永不 reject**——错误是值，调用方不需要 try/catch。 */
export type DevToolsPanelRequestResult =
  | { readonly outcome: 'ok'; readonly result: unknown }
  | { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload };

/**
 * 一次上传的结果。
 *
 * @remarks
 * `'sent'` 的字面意思就是它的全部含义：全部字节已按协议发出，且在此之前没有收到
 * 针对这次上传的 `ERROR`。它**不是**「provider 已提交」。理由见模块头第 2 条。
 */
export type DevToolsPanelUploadResult =
  { readonly outcome: 'sent' } | { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload };

/** 上传的字节来源。 */
export interface DevToolsPanelUploadSource {
  /** 总字节数；用于 `TRANSFER_START` 的 `totalBytes` 与限额预检。 */
  readonly totalBytes: number;
  /**
   * 读取 `[offset, offset + length)`。
   *
   * @param offset - 起始偏移，等于此前已发出的字节数。
   * @param length - 需要的字节数，恒 ≤ 256 KiB。
   * @returns 恰好 `length` 个字节；长度不符视为来源实现错误，本次上传以
   *   `operation_failed` 结束并发出 `TRANSFER_CANCEL`。
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/**
 * 一次下载的结果。
 *
 * @remarks
 * 三个分支，因为「字节去哪了」有三种真实答案，合并任意两个都会说谎：
 *
 * - `'received'` — 字节确实经 wire 走完了 `TRANSFER_*` 状态机并 `commit` 进了调用方给的 sink。
 * - `'delivered-at-source'` — connector 明确表示这次下载在**源侧**就交付完了（浏览器 OPFS
 *   走页面自己的保存路径，字节不过 wire），sink 一个字节都没收到。它是成功，但把它并进
 *   `'received'` 会让 UI 去读一个空 sink。
 * - `'failed'` — 带已映射的错误。
 */
export type DevToolsPanelDownloadResult =
  | { readonly outcome: 'received'; readonly result: unknown }
  | { readonly outcome: 'delivered-at-source'; readonly result: unknown }
  | { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload };

/** 一次下载调用的入参。 */
export interface DevToolsPanelDownloadRequest {
  /**
   * 构造 `files.download` 请求的 `params`。
   *
   * @remarks
   * 与 {@link DevToolsPanelUploadRequest.params} 同构，只是这次穿过去的是 `requestId`：
   * connector 侧的 `createChunkSource(requestId)` 只拿得到它，provider 想知道要读哪个文件，
   * 唯一的机会就是从 download 请求的 params 里拿到这同一个 ID。
   */
  readonly params: (requestId: string) => unknown;
  /** 字节下沉口；只有完整收完才会被 `commit`，其余终态一律 `discard`。 */
  readonly sink: DevToolsChunkSink;
}

/** 一次上传调用的入参。 */
export interface DevToolsPanelUploadRequest {
  /**
   * 构造 `files.upload` 请求的 `params`。
   *
   * @remarks
   * 是**函数**而不是对象：connector 侧的 `createChunkSink(transferId)` 只拿得到 transferId，
   * provider 想把字节落到哪个路径，唯一的机会就是从 upload 请求的 params 里拿到这同一个
   * transferId。让调用方自己拼，好过本模块往调用方的对象里塞键。
   */
  readonly params: (transferId: string) => unknown;
  /** 字节来源。 */
  readonly source: DevToolsPanelUploadSource;
}

/** panel 数据面客户端的构造端口。 */
export interface DevToolsPanelEndpointPorts {
  /** 出站回调；由平台 driver 接到具体 transport 上。 */
  readonly send: (message: DevToolsPanelNegotiationMessage) => void;
  /** 请求超时的唯一计时来源。 */
  readonly clock: DevToolsClock;
  /** 本端支持的协议版本；缺省 `[2, 1]`。 */
  readonly supportedVersions?: readonly number[];
}

/** panel 数据面客户端。 */
export interface DevToolsPanelEndpoint {
  /** 协商状态。 */
  readonly state: DevToolsPanelNegotiationState;
  /** 当前 session；未协商或已断开时为 `null`。 */
  readonly sessionId: string | null;
  /** session 是否仍然开着。 */
  readonly sessionOpen: boolean;
  /** 已进入 v1 facade 却发现对端会说 v2——提示用户重连以升级。 */
  readonly downgraded: boolean;
  /** connector 声明的档位；未协商成功时为 `null`。 */
  readonly capability: DevToolsCapability | null;
  /** connector 声明的 provider descriptor；未协商成功时为空。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  /** 在途请求数。 */
  readonly inflightRequests: number;
  /** 在途上传数。 */
  readonly inflightTransfers: number;
  /** 对端在协商期回报的错误。 */
  readonly rejection: DevToolsErrorPayload | null;
  /** 被拒帧数（含协商机拒掉的）；「拒绝」是可数的，「沉默」不是。 */
  readonly rejectedFrames: number;
  /** 发出首个 `PROTOCOL_HELLO`。 */
  start(): void;
  /** 处理一帧入站消息。 */
  receive(frame: unknown): void;
  /**
   * 发起一次 provider 调用。
   *
   * @param domain - provider 领域。
   * @param operation - 领域内的操作名。
   * @param params - 操作参数，按 provider 契约构造。
   * @returns 永不 reject 的结果。
   */
  request(domain: DevToolsProviderDomain, operation: string, params: unknown): Promise<DevToolsPanelRequestResult>;
  /**
   * 驱动一次 `files.upload`。
   *
   * @param request - params 构造器与字节来源。
   * @returns 永不 reject 的结果；成功语义见 {@link DevToolsPanelUploadResult}。
   */
  upload(request: DevToolsPanelUploadRequest): Promise<DevToolsPanelUploadResult>;
  /**
   * 驱动一次 `files.download`。
   *
   * @param request - params 构造器与字节下沉口。
   * @returns 永不 reject 的结果；三个分支的语义见 {@link DevToolsPanelDownloadResult}。
   */
  download(request: DevToolsPanelDownloadRequest): Promise<DevToolsPanelDownloadResult>;
  /**
   * 订阅 connector 推来的事件。
   *
   * @param listener - 事件回调。
   * @returns 退订函数；幂等。
   */
  onEvent(listener: (event: DevToolsEventPayload) => void): () => void;
  /** 请求 connector 清空本 session 的事件缓冲。 */
  clearEventBuffer(): void;
  /** 发送 `PING`。 */
  ping(): void;
  /** 主动断开：发 `DISCONNECT` 并就地结算所有在途工作。 */
  disconnect(): void;
  /** 停止收发并结算所有在途工作。 */
  dispose(): void;
}

/** 由协商机独占的消息类型；数据面路由必须放行它们。 */
const NEGOTIATION_OWNED_TYPES = new Set(['PROTOCOL_HELLO', 'HANDSHAKE', 'HANDSHAKE_ACK']);

/**
 * 非 `completed` 终态到错误码的映射；只在 `ERROR` 帧没给出归因时才用。
 *
 * @remarks
 * `cancelled` 与 `failed` 都落到 `operation_failed`，是因为**在这一端**它们确实不可分：
 * 面板看不见对端为什么收手。真正的归因由对端的 `ERROR` 帧给，那才是有区分度的那一路。
 * 两个超时合并成 `transfer_timeout`，理由同 `transfer.ts`：闸是哪一道属于控制面内部账。
 */
const TRANSFER_OUTCOME_CODES = {
  cancelled: 'operation_failed',
  failed: 'operation_failed',
  'idle-timeout': 'transfer_timeout',
  'total-timeout': 'transfer_timeout'
} as const satisfies Record<Exclude<DevToolsTransferOutcome, 'completed'>, DevToolsErrorCode>;

/** 一次在途请求的登记。 */
interface PendingRequest {
  readonly settle: (result: DevToolsPanelRequestResult) => void;
  readonly cancelTimeout: () => void;
}

/** 一次在途上传的登记。 */
interface PendingTransfer {
  readonly requestId: string;
  /** 提前终止这条上传；`null` 表示对端未报错（由 session 关闭触发）。 */
  readonly abort: (error: DevToolsErrorPayload) => void;
}

/**
 * 一次在途下载的登记。
 *
 * @remarks
 * 终态**只由传输表给**（`onSettled` 五种终态全覆盖），`cause` 只是归因。分成两件事是因为
 * 归因帧（`ERROR`）与终态帧（`TRANSFER_CANCEL`）是两帧：拿先到的那帧结算，就会在
 * 「读盘失败」和「用户取消」之间随机挑一个显示。
 */
interface PendingDownload {
  readonly sink: DevToolsChunkSink;
  /** 对端已开流时为传输 ID；仍为 `null` 即「字节在源侧交付」。 */
  transferId: string | null;
  /** `ERROR` 帧带来的精确归因；`null` 时按终态推一个通用码。 */
  cause: DevToolsErrorPayload | null;
  /**
   * sink 是否已经弃掉。
   *
   * @remarks
   * 断连时两条路径都想收尾：`#closeSession` 逐条弃掉在途下载，`download()` 拿到
   * `session_closed` 应答后也要弃掉「没开过流」的那条。契约要求 `discard` 幂等，所以两次
   * 调用不会弄坏真实 sink——但这个标志让「弃掉一次」成为结构事实，
   * 而不是靠每个实现都真的做到幂等。
   */
  discarded: boolean;
  /** 结算这次下载；`null` 表示完整收到。幂等由调用方保证（登记表里删一次）。 */
  readonly settle: (error: DevToolsErrorPayload | null) => void;
  /** 终态；`download()` 等它。 */
  readonly settled: Promise<DevToolsErrorPayload | null>;
}

/** 读一块字节与「被中止」之间的竞速结果。 */
type ChunkOutcome =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array }
  | { readonly kind: 'aborted'; readonly error: DevToolsErrorPayload };

/** 失败分支的公共构造；请求与上传两个结果联合共享同一个成员形状。 */
function failed(error: DevToolsErrorPayload): { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload } {
  return { outcome: 'failed', error };
}

class PanelEndpoint implements DevToolsPanelEndpoint {
  readonly #ports: DevToolsPanelEndpointPorts;
  readonly #negotiation: DevToolsPanelNegotiation;
  readonly #sequence = new SequenceGenerator();
  readonly #ids = new SequenceGenerator();
  readonly #requests = new Map<string, PendingRequest>();
  readonly #transfers = new Map<string, PendingTransfer>();
  readonly #downloads = new Map<string, PendingDownload>();
  /** 入站 transferId → 它属于哪次下载的 requestId。 */
  readonly #downloadIds = new Map<string, string>();
  readonly #listeners = new Set<(event: DevToolsEventPayload) => void>();

  /** 入站传输表；只在 session 内存在，因为 `negotiatedLimit` 是协商出来的。 */
  #inbound: DevToolsTransferTable | null = null;
  #sessionId: string | null = null;
  #capability: DevToolsCapability | null = null;
  #descriptors: readonly DevToolsProviderDescriptor[] = [];
  #negotiatedTransferLimit = 0;
  #rejectedFrames = 0;
  #disposed = false;

  get state(): DevToolsPanelNegotiationState {
    return this.#negotiation.state;
  }

  get sessionId(): string | null {
    return this.#sessionId;
  }

  get sessionOpen(): boolean {
    return this.#sessionId !== null;
  }

  get downgraded(): boolean {
    return this.#negotiation.downgraded;
  }

  get capability(): DevToolsCapability | null {
    return this.#capability;
  }

  get descriptors(): readonly DevToolsProviderDescriptor[] {
    return this.#descriptors;
  }

  get inflightRequests(): number {
    return this.#requests.size;
  }

  /** 上传与下载共用同一个并发额度：两个方向占的是同一条通道。 */
  get inflightTransfers(): number {
    return this.#transfers.size + this.#downloads.size;
  }

  get rejection(): DevToolsErrorPayload | null {
    return this.#negotiation.rejection;
  }

  get rejectedFrames(): number {
    return this.#negotiation.rejectedFrames + this.#rejectedFrames;
  }

  constructor(ports: DevToolsPanelEndpointPorts) {
    this.#ports = ports;
    this.#negotiation = createPanelNegotiation({
      send: message => ports.send(message),
      clock: ports.clock,
      ...(ports.supportedVersions === undefined ? {} : { supportedVersions: ports.supportedVersions })
    });
  }

  start(): void {
    this.#negotiation.start();
  }

  receive(frame: unknown): void {
    if (this.#disposed) return;

    const before = this.#negotiation.state;
    this.#negotiation.receive(frame);
    if (!isDevToolsV2Message(frame)) return;

    if (before !== 'v2' && this.#negotiation.state === 'v2' && frame.type === 'HANDSHAKE') {
      this.#openSession(frame.payload.sessionId, frame.payload.capabilities);
      return;
    }
    if (NEGOTIATION_OWNED_TYPES.has(frame.type)) return;
    this.#route(frame);
  }

  request(domain: DevToolsProviderDomain, operation: string, params: unknown): Promise<DevToolsPanelRequestResult> {
    const admission = this.#admitRequest();
    if (admission !== null) return Promise.resolve(failed(admission));
    return this.#issue(this.#mintId('req'), domain, operation, params);
  }

  async upload(request: DevToolsPanelUploadRequest): Promise<DevToolsPanelUploadResult> {
    const admission = this.#admitUpload(request.source.totalBytes);
    if (admission !== null) return failed(admission);

    const requestId = this.#mintId('req');
    const transferId = this.#mintId('trf');
    let abort: (error: DevToolsErrorPayload) => void = () => undefined;
    const aborted = new Promise<DevToolsErrorPayload>(resolve => {
      abort = resolve;
    });
    this.#transfers.set(transferId, { requestId, abort });

    // 请求先上线，传输帧紧随其后：同一条通道保序，因此 provider 在收到 START 时
    // 一定已经见过 params 里的 transferId，不必先等一轮 RESPONSE。
    void this.#issue(requestId, 'files', 'upload', request.params(transferId)).then(result => {
      if (result.outcome === 'failed') abort(result.error);
    });

    try {
      return await this.#drive(transferId, request.source, aborted);
    } finally {
      this.#transfers.delete(transferId);
    }
  }

  /**
   * START 早于 RESPONSE，因此登记必须早于发帧。
   *
   * @remarks
   * 顺序是协议给的（见 connector 端点的 `#beginDownload`）：RESPONSE 到手的那一刻，
   * `transferId` 是不是还为 `null` 就已经是最终答案，不需要再等任何时长。
   */
  async download(request: DevToolsPanelDownloadRequest): Promise<DevToolsPanelDownloadResult> {
    const admission = this.#admitTransfer();
    if (admission !== null) return failed(admission);

    const requestId = this.#mintId('req');
    let settle: (error: DevToolsErrorPayload | null) => void = () => undefined;
    const settled = new Promise<DevToolsErrorPayload | null>(resolve => {
      settle = resolve;
    });
    const pending: PendingDownload = {
      sink: request.sink,
      transferId: null,
      cause: null,
      discarded: false,
      settle,
      settled
    };
    this.#downloads.set(requestId, pending);

    try {
      return await this.#awaitDownload(requestId, pending, request.params(requestId));
    } finally {
      this.#downloads.delete(requestId);
      if (pending.transferId !== null) this.#downloadIds.delete(pending.transferId);
    }
  }

  onEvent(listener: (event: DevToolsEventPayload) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  clearEventBuffer(): void {
    if (this.#sessionId !== null) this.#send(createDevToolsV2Message('CLEAR_EVENT_BUFFER', null, this.#envelope()));
  }

  ping(): void {
    if (this.#sessionId !== null) this.#send(createDevToolsV2Message('PING', null, this.#envelope()));
  }

  disconnect(): void {
    if (this.#sessionId === null) return;
    this.#send(createDevToolsV2Message('DISCONNECT', null, this.#envelope('panel-to-connector')));
    this.#closeSession();
  }

  dispose(): void {
    this.#disposed = true;
    this.#closeSession();
    this.#listeners.clear();
    this.#negotiation.dispose();
  }

  /** session 建立：记下 capability 面并算出本端的传输上限。 */
  #openSession(sessionId: string, capabilities: DevToolsHandshakeCapabilities): void {
    this.#sessionId = sessionId;
    this.#capability = capabilities.capability;
    this.#descriptors = capabilities.descriptors;
    this.#negotiatedTransferLimit =
      resolveNegotiatedTransferLimit(
        capabilities.descriptors
          .filter(descriptor => descriptor.domain === 'files')
          .map(descriptor => descriptor.limits.maxTransferBytes)
      ) ?? 0;
    // 传输表建在 session 里而不是构造函数里：`negotiatedLimit` 是这次协商的产物，
    // 建早了就只能事后改它，而一张能被改上限的表等于没有上限。
    this.#inbound = createDevToolsTransferTable({
      clock: this.#ports.clock,
      negotiatedLimit: this.#negotiatedTransferLimit,
      onChunk: (transferId, data) => this.#writeChunk(transferId, data),
      onSettled: (transferId, outcome) => this.#onDownloadSettled(transferId, outcome)
    });
  }

  /**
   * 数据面路由。
   *
   * @remarks
   * 三道闸的顺序不能换：先认 `DISCONNECT`（它在 session 已关时仍然合法），再验 session，
   * 最后才按类型分发。反过来会让断连帧在 session 轮换后被记成「被拒帧」，
   * 把一次正常收尾伪装成一次攻击。
   */
  #route(message: DevToolsV2Message): void {
    if (message.type === 'DISCONNECT') {
      this.#closeSession();
      return;
    }
    if (this.#sessionId === null || message.sessionId !== this.#sessionId) {
      this.#rejectedFrames += 1;
      return;
    }
    if (message.type === 'RESPONSE') {
      this.#settle(message.payload.requestId, { outcome: 'ok', result: message.payload.result });
      return;
    }
    if (message.type === 'ERROR') {
      this.#onError(message.payload.requestId, message.payload.error);
      return;
    }
    if (message.type === 'EVENT') {
      for (const listener of this.#listeners) listener(message.payload);
      return;
    }
    // 入站的 `TRANSFER_*` 只可能属于下载：上传那一向的帧由本端发出，对端从不回声。
    if (message.type === 'TRANSFER_START') {
      this.#onDownloadStart(message.payload);
      return;
    }
    if (message.type === 'TRANSFER_CHUNK') {
      this.#onInboundFrame(this.#inbound?.chunk(message.payload));
      return;
    }
    if (message.type === 'TRANSFER_COMPLETE') {
      this.#onInboundFrame(this.#inbound?.complete(message.payload));
      return;
    }
    if (message.type === 'TRANSFER_CANCEL') {
      this.#onInboundFrame(this.#inbound?.cancel(message.payload));
      return;
    }
    if (message.type !== 'PONG') this.#rejectedFrames += 1;
  }

  /**
   * 结算一条在途请求。
   *
   * @remarks
   * 找不到登记的一律计入被拒帧：迟到应答、未发出过的 ID 与伪造应答在这一层无法区分，
   * 也不需要区分——它们的处置完全相同，而**数得出来**才是这里唯一要保住的性质。
   */
  #settle(requestId: string, result: DevToolsPanelRequestResult): void {
    const pending = this.#requests.get(requestId);
    if (pending === undefined) {
      this.#rejectedFrames += 1;
      return;
    }
    this.#requests.delete(requestId);
    pending.cancelTimeout();
    pending.settle(result);
  }

  /**
   * `requestId` 为 `null` 的 ERROR 不归属任何请求（协议层错误），只记数。
   *
   * @remarks
   * 请求已经被 RESPONSE 结算、却仍有一条流挂在同一个 requestId 上，是**下载独有**的形态：
   * 归因记下来，终态交给紧随其后的 `TRANSFER_CANCEL`（顺序见 connector 端点的
   * `#failOutbound`）。当场结算的话，随后那帧 CANCEL 就成了一条无主帧。
   */
  #onError(requestId: string | null, error: DevToolsErrorPayload): void {
    if (requestId === null) {
      this.#rejectedFrames += 1;
      return;
    }
    if (this.#requests.has(requestId)) {
      this.#settle(requestId, failed(error));
      return;
    }
    const pending = this.#downloads.get(requestId);
    if (pending === undefined) {
      this.#rejectedFrames += 1;
      return;
    }
    pending.cause = error;
  }

  /** 额度与 session 预检；通过返回 `null`。 */
  #admitRequest(): DevToolsErrorPayload | null {
    if (this.#sessionId === null) return createDevToolsError('session_closed', { retryable: true });
    if (this.#requests.size >= DEVTOOLS_MAX_INFLIGHT_REQUESTS) {
      return createDevToolsError('request_limit_exceeded', { retryable: true });
    }
    return null;
  }

  /** 请求额度 + 传输并发额度；不含体积判定——下载的体积要等对端的 START 才知道。 */
  #admitTransfer(): DevToolsErrorPayload | null {
    const requestAdmission = this.#admitRequest();
    if (requestAdmission !== null) return requestAdmission;
    if (this.inflightTransfers >= DEVTOOLS_MAX_INFLIGHT_TRANSFERS) {
      return createDevToolsError('transfer_limit_exceeded', { retryable: true });
    }
    return null;
  }

  #admitUpload(totalBytes: number): DevToolsErrorPayload | null {
    const admission = this.#admitTransfer();
    if (admission !== null) return admission;
    if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > this.#negotiatedTransferLimit) {
      return createDevToolsError('transfer_size_exceeded');
    }
    return null;
  }

  #issue(
    requestId: string,
    domain: DevToolsProviderDomain,
    operation: string,
    params: unknown
  ): Promise<DevToolsPanelRequestResult> {
    return new Promise<DevToolsPanelRequestResult>(resolve => {
      const cancelTimeout = this.#ports.clock.setTimeout(
        () => this.#settle(requestId, failed(createDevToolsError('request_timeout', { retryable: true }))),
        DEVTOOLS_REQUEST_TIMEOUT_MS
      );
      this.#requests.set(requestId, { settle: resolve, cancelTimeout });
      this.#send(createDevToolsV2Message('REQUEST', { requestId, domain, operation, params }, this.#envelope()));
    });
  }

  /**
   * 等这次下载走到能下结论的那一刻。
   *
   * @remarks
   * 三条出路对应 {@link DevToolsPanelDownloadResult} 的三个分支。判定顺序是「先看 `cause`
   * 再看 `transferId`」：本端拒掉 START 时两者都动了，只看 `transferId` 会把一次被拒的流
   * 报成「在源侧交付」——那是成功分支，UI 会去读一个空 sink。
   */
  async #awaitDownload(
    requestId: string,
    pending: PendingDownload,
    params: unknown
  ): Promise<DevToolsPanelDownloadResult> {
    const response = await this.#issue(requestId, 'files', 'download', params);
    if (response.outcome === 'failed') {
      await (pending.transferId === null ? this.#discard(pending) : pending.settled);
      return failed(response.error);
    }
    if (pending.cause !== null && pending.transferId === null) return failed(pending.cause);
    if (pending.transferId === null) {
      // sink 一个字节都没收到，但它可能已经建好临时产物；不 discard 就漏一个临时文件。
      await this.#discard(pending);
      return { outcome: 'delivered-at-source', result: response.result };
    }

    const error = await pending.settled;
    return error === null ? { outcome: 'received', result: response.result } : failed(error);
  }

  /**
   * 对端开了一条流。
   *
   * @remarks
   * 拒绝时发 `TRANSFER_CANCEL` 而不是 `ERROR`：wire 上 `ERROR` 是单向的
   * （`connector-to-panel`），面板发不出去。CANCEL 是双向的，也正好是让对端收手的那一帧。
   */
  #onDownloadStart(payload: DevToolsTransferStartPayload): void {
    const pending = this.#downloads.get(payload.requestId);
    if (pending === undefined || pending.transferId !== null || this.#inbound === null) {
      this.#rejectedFrames += 1;
      return;
    }

    const result = this.#inbound.start(payload);
    if (result.outcome === 'rejected') {
      this.#rejectedFrames += 1;
      pending.cause = result.error;
      this.#send(
        createDevToolsV2Message(
          'TRANSFER_CANCEL',
          { transferId: payload.transferId },
          this.#envelope('panel-to-connector')
        )
      );
      void this.#discard(pending);
      pending.settle(result.error);
      return;
    }
    pending.transferId = payload.transferId;
    this.#downloadIds.set(payload.transferId, payload.requestId);
  }

  /** CHUNK / COMPLETE / CANCEL 三帧共用：被拒即计数，终态走 `onSettled`。 */
  #onInboundFrame(result: Promise<DevToolsTransferResult> | undefined): void {
    if (result === undefined) {
      this.#rejectedFrames += 1;
      return;
    }
    void result.then(settled => {
      if (settled.outcome === 'rejected') this.#rejectedFrames += 1;
    });
  }

  /**
   * 把一块字节写进这次下载的 sink。
   *
   * @remarks
   * 找不到归属就**抛**：resolve 掉等于让状态机把这一块记成已落盘，接下来的 offset 校验
   * 全部对得上，最后 COMPLETE 会提交一个中间少了一段的文件。
   */
  async #writeChunk(transferId: string, data: Uint8Array): Promise<void> {
    const pending = this.#downloadOf(transferId);
    if (pending === undefined) throw new Error(`no devtools download for transfer "${transferId}"`);
    await pending.sink.write(data);
  }

  /** 传输终态 → 下载终态。 */
  async #onDownloadSettled(transferId: string, outcome: DevToolsTransferOutcome): Promise<void> {
    const pending = this.#downloadOf(transferId);
    if (pending === undefined) return;

    this.#downloadIds.delete(transferId);
    pending.settle(await this.#finish(pending, outcome));
  }

  /** 只有 `completed` 能 commit；归因优先用 `ERROR` 帧带来的那个。 */
  async #finish(pending: PendingDownload, outcome: DevToolsTransferOutcome): Promise<DevToolsErrorPayload | null> {
    if (outcome !== 'completed') {
      await this.#discard(pending);
      return pending.cause ?? createDevToolsError(TRANSFER_OUTCOME_CODES[outcome]);
    }
    try {
      await pending.sink.commit();
      return null;
    } catch {
      await this.#discard(pending);
      return createDevToolsError('operation_failed');
    }
  }

  #downloadOf(transferId: string): PendingDownload | undefined {
    const requestId = this.#downloadIds.get(transferId);
    return requestId === undefined ? undefined : this.#downloads.get(requestId);
  }

  /** 清理临时产物；至多一次，且失败没有第二条补救路径。 */
  async #discard(pending: PendingDownload): Promise<void> {
    if (pending.discarded) return;
    pending.discarded = true;
    try {
      await pending.sink.discard();
    } catch {
      // 无处可退：临时产物的兜底是宿主的清理，不是这里再报一次。
    }
  }

  /** START → CHUNK* → COMPLETE；每块只在自己那一轮里存在。 */
  async #drive(
    transferId: string,
    source: DevToolsPanelUploadSource,
    aborted: Promise<DevToolsErrorPayload>
  ): Promise<DevToolsPanelUploadResult> {
    const requestId = this.#transfers.get(transferId)?.requestId ?? '';
    const start = { transferId, requestId, totalBytes: source.totalBytes };
    this.#send(createDevToolsV2Message('TRANSFER_START', start, this.#envelope('panel-to-connector')));

    let offset = 0;
    let chunkIndex = 0;
    while (offset < source.totalBytes) {
      const length = Math.min(DEVTOOLS_MAX_CHUNK_BYTES, source.totalBytes - offset);
      const outcome = await this.#readChunk(source, offset, length, aborted);
      if (outcome.kind === 'aborted') return { outcome: 'failed', error: outcome.error };
      if (outcome.bytes.length !== length) return this.#cancel(transferId, createDevToolsError('operation_failed'));

      const payload = { transferId, chunkIndex, offset, dataBase64: encodeCanonicalBase64(outcome.bytes) };
      this.#send(createDevToolsV2Message('TRANSFER_CHUNK', payload, this.#envelope('panel-to-connector')));
      offset += length;
      chunkIndex += 1;
    }

    this.#send(createDevToolsV2Message('TRANSFER_COMPLETE', { transferId }, this.#envelope('panel-to-connector')));
    return { outcome: 'sent' };
  }

  /**
   * 读一块字节，同时盯着中止信号。
   *
   * @remarks
   * 必须竞速而不是先 `await read`：字节来源可能是一个永不 resolve 的读（例如宿主已经
   * 把文件句柄收走），那时只有中止信号能让这条上传收场。
   */
  async #readChunk(
    source: DevToolsPanelUploadSource,
    offset: number,
    length: number,
    aborted: Promise<DevToolsErrorPayload>
  ): Promise<ChunkOutcome> {
    try {
      return await Promise.race<ChunkOutcome>([
        source.read(offset, length).then(bytes => ({ kind: 'bytes', bytes }) as const),
        aborted.then(error => ({ kind: 'aborted', error }) as const)
      ]);
    } catch {
      return { kind: 'aborted', error: createDevToolsError('operation_failed') };
    }
  }

  #cancel(transferId: string, error: DevToolsErrorPayload): DevToolsPanelUploadResult {
    this.#send(createDevToolsV2Message('TRANSFER_CANCEL', { transferId }, this.#envelope('panel-to-connector')));
    return { outcome: 'failed', error };
  }

  /** session 收尾：在途请求与两个方向的传输全部就地结算，不留悬挂 promise。 */
  #closeSession(): void {
    this.#sessionId = null;
    // 先拆表：`dispose` 不触发 `onSettled`，下载的收尾由下面这轮统一做，
    // 否则同一条下载会被结算两次（一次带 `session_closed`，一次带取消码）。
    this.#inbound?.dispose();
    this.#inbound = null;
    this.#downloadIds.clear();

    const closed = createDevToolsError('session_closed', { retryable: true });
    for (const [requestId] of [...this.#requests]) this.#settle(requestId, failed(closed));
    for (const transfer of [...this.#transfers.values()]) transfer.abort(closed);
    for (const pending of [...this.#downloads.values()]) {
      void this.#discard(pending);
      pending.settle(closed);
    }
  }

  #mintId(prefix: string): string {
    return `${prefix}-${this.#ids.next()}`;
  }

  /**
   * 每帧一个新 sequence。
   *
   * @remarks
   * `direction` 只有双向类型（四个 `TRANSFER_*` 与 `DISCONNECT`）才需要显式给；单向类型
   * 由 wire 自己推导，给错会在 `createDevToolsV2Message` 里直接抛。
   */
  #envelope(direction?: DevToolsV2Direction): DevToolsV2MessageOptions {
    return {
      sessionId: this.#sessionId,
      sequence: this.#sequence.next(),
      timestamp: this.#ports.clock.now(),
      ...(direction === undefined ? {} : { direction })
    };
  }

  #send(message: DevToolsV2Message): void {
    this.#ports.send(message);
  }
}

/**
 * 创建 panel 侧数据面客户端。
 *
 * @remarks
 * 一个实例只服务一次 transport connection；重连必须重新创建（理由同协商机：
 * v1 facade 是终态，而终态的边界正是连接本身）。
 *
 * @param ports - 收发回调与时钟。
 * @returns 平台无关的数据面客户端。
 */
export function createDevToolsPanelEndpoint(ports: DevToolsPanelEndpointPorts): DevToolsPanelEndpoint {
  return new PanelEndpoint(ports);
}
