/**
 * @fileoverview connector 侧 v2 端点：把协商、session、传输表、授权与 provider 派发接成一条链路。
 *
 * @remarks
 * 分散的状态机各自都能单测，但**它们之间的接线本身才是协议**：授权排在登记之前（被拒的调用
 * 不得占用预算）、登记排在 provider 调用之前（越限的请求不得触碰 host）、迟到的结果必须先过
 * session 的结算门（超时或轮换后的响应不得进入新状态）。这些顺序在任何单个模块里都看不出来，
 * 只有在这里才成立或失效，所以它是产品代码而不是测试脚手架——US-904 阶段 C 的 Chrome driver 与
 * US-904 阶段 D 与 US-905 的原生 driver 复用的正是这份接线。
 *
 * panel 侧只导出协商机（见 `negotiation-panel`）：数据面客户端归 US-904 阶段 C，本模块不预判它的形状。
 *
 * @module @aiao/rxdb-devtools/v2/endpoint
 */

import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from '../provider/descriptor.js';
import { resolveNegotiatedTransferLimit } from '../provider/limits.js';
import type {
  DevToolsChunkSink,
  DevToolsChunkSource,
  DevToolsProvider,
  DevToolsProviderResult
} from '../provider/types.js';
import { SequenceGenerator } from '../sequence.js';
import type { AnyDevToolsMessage, DevToolsCapability } from '../types.js';
import type { DevToolsMutationPolicy } from './authorization.js';
import { authorizeMessage, authorizeOperation } from './authorization.js';
import { encodeCanonicalBase64 } from './base64.js';
import type { DevToolsCancelTimer, DevToolsClock } from './clock.js';
import { DEVTOOLS_MAX_CHUNK_BYTES, DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS } from './constants.js';
import type { DevToolsErrorCode, DevToolsErrorPayload } from './errors.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsConnectorNegotiation, DevToolsConnectorNegotiationMessage } from './negotiation-connector.js';
import { createConnectorNegotiation } from './negotiation-connector.js';
import type { DevToolsSession } from './session.js';
import { createDevToolsSession } from './session.js';
import type { DevToolsTransferOutcome, DevToolsTransferTable } from './transfer.js';
import { createDevToolsTransferTable } from './transfer.js';
import type {
  DevToolsRequestPayload,
  DevToolsTransferChunkPayload,
  DevToolsTransferIdPayload,
  DevToolsTransferStartPayload,
  DevToolsV2EnvelopeShape,
  DevToolsV2Message,
  DevToolsV2MessageOptions,
  DevToolsV2MessageType
} from './wire.js';
import { createDevToolsV2Message, isDevToolsV2Envelope, isDevToolsV2Message } from './wire.js';

/**
 * 端点访问 provider 的全部接缝。
 *
 * @remarks
 * 只有三个成员，且都不带 host 概念：端点不认识 OPFS、SQLite 或 Rust 命令，它只知道
 * 「按领域取一个 provider」「为一次传输开一个 sink」。真实 host 与 fake 在这里同形，
 * conformance suite 才能对两者跑同一份断言。
 */
export interface DevToolsProviderRegistry {
  /** 本 session 存在的 provider 声明；顺序即 wire 上的顺序。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  /**
   * 取某个领域的 provider。
   *
   * @remarks
   * 不返回 `undefined`：领域不可用由 provider 自己答 `provider_unavailable`，
   * 「领域缺席」则在授权层就以 `provider_unsupported` 拦下，两者不能混成一个空值。
   */
  provider(domain: DevToolsProviderDomain): DevToolsProvider;
  /** 为一次传输开一个分块落盘接收器；只有合法 COMPLETE 会 commit。 */
  createChunkSink(name: string): DevToolsChunkSink;
  /**
   * 为一次已成功的 `files.download` 开一个字节来源。
   *
   * @remarks
   * 返回 `undefined` 的含义是**字节已在源侧交付**（浏览器 OPFS 由页面自己保存，见
   * `browser/opfs-files-provider.ts` 模块头第 2 条），而不是「这个 provider 不支持下载」——
   * 后者在 descriptor 的 `operations` 里就已经说清楚了，授权层会先一步拦下，轮不到这里表达。
   * 两者共用一个空值会让「没接线」和「有意不流式」在端点看来完全一样。
   *
   * 用 `requestId` 而不是另铸一个 ID 作键：provider 认回「我刚答应下载的那个文件」唯一可靠的
   * 依据就是那次调用本身，而 transferId 此刻还不存在（它由端点在本方法返回之后才铸造）。
   *
   * @param requestId - 触发这次下载的 REQUEST ID。
   * @returns 要送上 wire 的字节来源，或 `undefined`。
   */
  createChunkSource(requestId: string): DevToolsChunkSource | undefined;
}

/** 端点的构造端口。 */
export interface DevToolsConnectorEndpointPorts {
  /** 出站回调；v1 legacy 握手与 v2 帧都走这里。 */
  readonly send: (message: DevToolsConnectorNegotiationMessage) => void;
  /** 全部时限的唯一注入点。 */
  readonly clock: DevToolsClock;
  /** connector owner 本地配置的档位；wire 上回显的值不作数。 */
  readonly capability: DevToolsCapability;
  /** connector owner 本地配置的写入开关。 */
  readonly mutationPolicy: DevToolsMutationPolicy;
  /** provider 接缝。 */
  readonly providers: DevToolsProviderRegistry;
  /** owner 自己构造的 eager v1 握手；端点只决定它何时出门。 */
  readonly legacyHandshake: AnyDevToolsMessage;
  /** 覆盖本端声明的协议版本列表，默认 `[2, 1]`。 */
  readonly supportedVersions?: readonly number[];
}

/** connector 侧 v2 端点。 */
export interface DevToolsConnectorEndpoint {
  /** 本端点铸造的 session 身份；构造即固定，握手成功与否都不变。 */
  readonly sessionId: string;
  /** 是否已建立并仍持有 v2 session。 */
  readonly sessionOpen: boolean;
  /** 在途 request 数。 */
  readonly inflightRequests: number;
  /** 在途入站 transfer 数。 */
  readonly inflightTransfers: number;
  /** 在途出站（下载）transfer 数。 */
  readonly inflightDownloads: number;
  /** 发出 eager v1 握手，开始协商。 */
  start(): void;
  /** 处理一帧入站数据；非本协议的值一律忽略。 */
  receive(frame: unknown): void;
  /**
   * 把 provider 推上来的一条事件发给面板。
   *
   * @remarks
   * 事件是**推**的，不是 `invoke` 的返回值：`database.events` 只负责建立订阅，此后每条
   * 事件都经这里成帧。让 provider 攒起来等面板轮询，会同时丢掉时序与背压两件事。
   *
   * 不满足发送条件时静默丢弃，且不报错——事件没有 `requestId`，对端没有任何在等的东西，
   * 回一条错误只会在 `none` 档上凭空造出一条下行帧。
   *
   * @param eventType - 事件类型；语义由 provider 定义，端点不解释。
   * @param data - 事件载荷；端点不加工，遮罩是 provider 的职责。
   */
  emitEvent(eventType: string, data: unknown): void;
  /** 释放全部计时器、传输与订阅。 */
  dispose(): void;
}

/** 传输在本端点的归属信息；用于把终态归因到发起它的那条 REQUEST。 */
interface TransferBinding {
  readonly requestId: string;
  readonly sink: DevToolsChunkSink;
}

/** 一条出站（connector → panel）传输的账本。 */
interface OutboundTransfer {
  readonly transferId: string;
  readonly requestId: string;
  readonly source: DevToolsChunkSource;
  readonly cancelTotal: DevToolsCancelTimer;
}

/**
 * 入站传输在本协议里只服务 `files.upload`。
 *
 * @remarks
 * `TRANSFER_START` 不带 domain/operation，但它并非无主：授权必须按它实际要做的事判定，
 * 否则 `readonly` 档只要绕开 REQUEST 直接发 START 就能写文件。
 */
const TRANSFER_DOMAIN = 'files' as const;
const TRANSFER_OPERATION = 'upload' as const;

/**
 * 出站传输唯一的来源操作。
 *
 * @remarks
 * 出站方向不需要独立的授权判定：它只可能由一次**已经通过三层授权**的 `files.download`
 * 产生，端点从不主动推字节。这也是它与入站方向的根本差别——入站的 START 是对端发起的，
 * 必须自己带上授权判定；出站的 START 是本端对一次已授权调用的续写。
 */
const DOWNLOAD_OPERATION = 'download' as const;

/**
 * 事件订阅在授权矩阵里的坐标。
 *
 * @remarks
 * 与传输同理：EVENT 帧本身不带 domain/operation，但订阅要做的事就是 `database.events`，
 * 按它判定才谈得上「三层授权」。
 */
const EVENT_DOMAIN = 'database' as const;
const EVENT_OPERATION = 'events' as const;

/** 由协商机独占错误语义的三种帧；端点不得对它们重复回错。 */
const NEGOTIATION_OWNED_TYPES: ReadonlySet<DevToolsV2MessageType> = new Set<DevToolsV2MessageType>([
  'PROTOCOL_HELLO',
  'HANDSHAKE',
  'HANDSHAKE_ACK'
]);

class DevToolsConnectorEndpointImpl implements DevToolsConnectorEndpoint {
  readonly #ports: DevToolsConnectorEndpointPorts;
  readonly #negotiation: DevToolsConnectorNegotiation;
  readonly #sequence = new SequenceGenerator();
  readonly #ids = new SequenceGenerator();
  readonly #transferBindings = new Map<string, TransferBinding>();
  readonly #outbound = new Map<string, OutboundTransfer>();
  #session: DevToolsSession | null = null;
  #transfers: DevToolsTransferTable | null = null;
  #negotiatedTransferLimit = 0;
  /**
   * 本 session 的事件订阅是否通过了三层授权。
   *
   * @remarks
   * 判据取**授权结论**而不是 `#openEventStream` 的成败：授权是这条下行通道该不该存在的
   * 唯一依据，而订阅成功与否只说明 host 此刻能不能给出事件。两者混用会引入一个竞态——
   * provider 在 `invoke` 内同步派发的第一条事件会早于 promise 落定，于是被无声丢掉。
   */
  #eventsAuthorized = false;

  get sessionId(): string {
    return this.#negotiation.sessionId;
  }

  get sessionOpen(): boolean {
    return this.#session?.state === 'open';
  }

  get inflightRequests(): number {
    return this.#session?.inflightRequests ?? 0;
  }

  get inflightTransfers(): number {
    return this.#session?.inflightTransfers ?? 0;
  }

  get inflightDownloads(): number {
    return this.#outbound.size;
  }

  constructor(ports: DevToolsConnectorEndpointPorts) {
    this.#ports = ports;
    this.#negotiation = createConnectorNegotiation({
      send: message => ports.send(message),
      clock: ports.clock,
      capability: ports.capability,
      descriptors: ports.providers.descriptors,
      legacyHandshake: ports.legacyHandshake,
      ...(ports.supportedVersions === undefined ? {} : { supportedVersions: ports.supportedVersions })
    });
  }

  start(): void {
    this.#negotiation.start();
  }

  receive(frame: unknown): void {
    const before = this.#negotiation.state;
    this.#negotiation.receive(frame);
    if (this.#negotiation.state === 'v2' && before !== 'v2') this.#openSession();
    if (isDevToolsV2Message(frame)) {
      this.#route(frame);
      return;
    }
    if (isDevToolsV2Envelope(frame)) this.#rejectMalformed(frame);
  }

  emitEvent(eventType: string, data: unknown): void {
    if (this.#session?.state !== 'open') return;
    if (!this.#eventsAuthorized) return;

    this.#ports.send(createDevToolsV2Message('EVENT', { eventType, data }, this.#envelope()));
  }

  dispose(): void {
    this.#closeSession();
    this.#negotiation.dispose();
  }

  /**
   * 数据面路由。
   *
   * @remarks
   * 三道闸的顺序是承重的：无 session 静默（回帧等于向未协商的对端确认自己存在）、
   * session 不符结构化拒绝（这是**已识别**的错帧）、档位不足再次静默。
   */
  #route(message: DevToolsV2Message): void {
    const session = this.#session;
    if (session === null || session.state !== 'open') return;
    if (!session.accepts(message.sessionId)) {
      this.#sendError(null, createDevToolsError('session_invalid'));
      return;
    }
    if (!authorizeMessage(message.type, this.#ports.capability)) return;

    this.#dispatchFrame(message);
  }

  /**
   * 外层合法、payload 不合法的数据面帧一律回 `invalid_message`。
   *
   * @remarks
   * 静默会让「越界数值」与「未送达」在 wire 上无法区分，调用方唯一能做的是等到 15 秒请求
   * 时限——把一次即时可判的格式错误拖成一次超时。所以数值越界、NaN、分数、溢出走的是
   * 结构化拒绝而不是沉默，且因为 `requestId` 本身就在不可信的 payload 里，只能报 `null`。
   *
   * 协商三帧不在此列：它们的错误语义（`protocol_unsupported` / `invalid_message` / 拒绝计数）
   * 归协商机独有，在这里再答一次就会出现两条错误帧。
   *
   * @param envelope - 外层已通过、payload 未通过的帧。
   */
  #rejectMalformed(envelope: DevToolsV2EnvelopeShape): void {
    if (NEGOTIATION_OWNED_TYPES.has(envelope.type)) return;
    const session = this.#session;
    if (session === null || session.state !== 'open') return;
    if (!session.accepts(envelope.sessionId)) {
      this.#sendError(null, createDevToolsError('session_invalid'));
      return;
    }
    if (!authorizeMessage(envelope.type, this.#ports.capability)) return;

    this.#sendError(null, createDevToolsError('invalid_message'));
  }

  #dispatchFrame(message: DevToolsV2Message): void {
    switch (message.type) {
      case 'REQUEST':
        this.#onRequest(message.payload);
        return;
      case 'PING':
        this.#sendPong();
        return;
      case 'DISCONNECT':
        this.#closeSession();
        return;
      case 'TRANSFER_START':
        this.#onTransferStart(message.payload);
        return;
      case 'TRANSFER_CHUNK':
        void this.#onTransferChunk(message.payload);
        return;
      case 'TRANSFER_COMPLETE':
        void this.#settleTransferFrame(message.payload, 'complete');
        return;
      case 'TRANSFER_CANCEL':
        // 出站方向先认领：同一个 CANCEL 帧交给入站表只会得到 `transfer_closed`，
        // 于是「面板正常取消了一次下载」在 wire 上被写成一条错误。
        if (!this.#cancelOutbound(message.payload.transferId)) {
          void this.#settleTransferFrame(message.payload, 'cancel');
        }
        return;
      default:
        // 协商帧由 negotiation 处理；connector-to-panel 的类型不该回流，忽略即可。
        return;
    }
  }

  #onRequest(payload: DevToolsRequestPayload): void {
    const authorization = authorizeOperation({
      capability: this.#ports.capability,
      mutationPolicy: this.#ports.mutationPolicy,
      descriptors: this.#ports.providers.descriptors,
      domain: payload.domain,
      operation: payload.operation
    });
    if (authorization.outcome === 'silent-drop') return;
    if (authorization.outcome === 'rejected') {
      this.#sendError(payload.requestId, authorization.error);
      return;
    }

    // 登记先于调用：越限的请求必须在触碰 host 之前就被挡下。
    const registration = this.#session?.registerRequest(payload.requestId);
    if (registration === undefined) return;
    if (registration.outcome === 'rejected') {
      this.#sendError(payload.requestId, registration.error);
      return;
    }
    void this.#invoke(payload);
  }

  /**
   * 调用一个 provider，并把「实现抛了」收敛成一次普通失败。
   *
   * @remarks
   * 契约要求 provider 只用错误联合说话（见 `provider/types.ts`），但契约挡不住 bug：
   * 一次 reject 会顺着调用点的 `void` 逃到全局，而请求**永不结算** —— 对端只能白等满
   * 15 秒的时限，这段时间里在途名额一直被占用，墓碑也永远不会记上。
   *
   * 这里不做平台映射：能抛到这一层，说明它绕过了 provider 自己的映射，剩下的信息不足以
   * 安全归类。`operation_failed` 是唯一诚实的答案。
   */
  async #callProvider(
    domain: DevToolsProviderDomain,
    operation: string,
    params: unknown
  ): Promise<DevToolsProviderResult> {
    try {
      return await this.#ports.providers.provider(domain).invoke(operation, params);
    } catch {
      return { outcome: 'failed', error: createDevToolsError('operation_failed') };
    }
  }

  async #invoke(payload: DevToolsRequestPayload): Promise<void> {
    const result = await this.#callProvider(payload.domain, payload.operation, payload.params);
    // 结算门同时挡住两件事：已超时的请求，以及 session 轮换后迟到的结果。
    if (this.#session?.settleRequest(payload.requestId) !== true) return;

    if (result.outcome === 'failed') {
      this.#sendError(payload.requestId, result.error);
      return;
    }

    const outbound = this.#beginDownload(payload);
    // `failed` 时错误帧已经发过，再补一条 RESPONSE 就成了同一个 requestId 上的两次结算。
    if (outbound === 'failed') return;
    this.#sendResponse(payload.requestId, result.result);
    if (outbound !== 'no-stream') void this.#pump(outbound);
  }

  /**
   * 一次成功的 `files.download` 之后，决定要不要把字节推上 wire。
   *
   * @remarks
   * **`TRANSFER_START` 必须早于这次调用的 `RESPONSE`**，这条顺序是协议的一部分而不是实现细节：
   * 同一条通道保序，于是面板在收到 RESPONSE 的那一刻就能确定「有没有流要来」——START 已经到了
   * 就是有，没到就是没有。反过来先发 RESPONSE 的话，面板分不清「字节在源侧交付了」和
   * 「START 还在路上」，只能靠等一个猜出来的时长，而那个时长在慢链路上一定是错的。
   *
   * @param payload - 已成功的 REQUEST 载荷。
   * @returns 已开好的出站传输；无需流式时为 `'no-stream'`；已发过错误帧时为 `'failed'`。
   */
  #beginDownload(payload: DevToolsRequestPayload): OutboundTransfer | 'no-stream' | 'failed' {
    if (payload.domain !== TRANSFER_DOMAIN || payload.operation !== DOWNLOAD_OPERATION) return 'no-stream';

    const source = this.#openChunkSource(payload.requestId);
    if (source === undefined) return 'no-stream';
    if (source === 'failed') return 'failed';
    // 超限在这里就要挡下：面板的传输表照样会拒 START，但那时字节来源已经开着，
    // 而端点收不到自己发出去的那条拒绝，句柄就留在原地了。
    if (source.totalBytes > this.#negotiatedTransferLimit) {
      return this.#abandon(source, payload.requestId, 'transfer_size_exceeded');
    }

    const transferId = `dl-${this.#ids.next()}`;
    const registration = this.#session?.registerTransfer(transferId);
    if (registration === undefined) return this.#abandon(source, payload.requestId, 'session_closed');
    if (registration.outcome === 'rejected') {
      this.#session?.releaseTransfer(transferId);
      return this.#abandon(source, payload.requestId, registration.error.code);
    }

    const transfer: OutboundTransfer = {
      transferId,
      requestId: payload.requestId,
      source,
      cancelTotal: this.#ports.clock.setTimeout(
        () => this.#expireOutbound(transferId),
        DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
      )
    };
    this.#outbound.set(transferId, transfer);
    const start = { transferId, requestId: payload.requestId, totalBytes: source.totalBytes };
    this.#ports.send(createDevToolsV2Message('TRANSFER_START', start, this.#envelope()));
    return transfer;
  }

  /**
   * 取一次下载的字节来源。
   *
   * @remarks
   * 契约说这里返回 `undefined` 表示「已在源侧交付」，但契约挡不住 bug：抛出来的话
   * 这次下载会既没有流也没有失败通知。归到 `operation_failed` 而不是静默，
   * 是因为面板此刻正按上面那条顺序判断「有没有流」，静默会让它判成「没有」。
   */
  #openChunkSource(requestId: string): DevToolsChunkSource | undefined | 'failed' {
    try {
      return this.#ports.providers.createChunkSource(requestId);
    } catch {
      this.#sendError(requestId, createDevToolsError('operation_failed'));
      return 'failed';
    }
  }

  /** 开了来源却没能开成传输：报错并把句柄还回去，不留下一个没人读的读者。 */
  #abandon(source: DevToolsChunkSource, requestId: string, code: DevToolsErrorCode): 'failed' {
    this.#sendError(requestId, createDevToolsError(code));
    void this.#closeSource(source);
    return 'failed';
  }

  /**
   * START → CHUNK* → COMPLETE。
   *
   * @remarks
   * 每一次 `await` 之后都要重新确认这条传输还在表里：取消、总时长到点与断连都只能在
   * `await` 的间隙生效，不重新确认就会往一条已经结算的传输上继续发帧。
   */
  async #pump(transfer: OutboundTransfer): Promise<void> {
    const { transferId, source } = transfer;
    let offset = 0;
    let chunkIndex = 0;

    while (offset < source.totalBytes) {
      const length = Math.min(DEVTOOLS_MAX_CHUNK_BYTES, source.totalBytes - offset);
      const bytes = await this.#readChunk(source, offset, length);
      if (this.#outbound.get(transferId) !== transfer) return;
      // 短读被当成正常结果的话，对端拿到的是一个静默截断的文件。
      if (bytes === undefined || bytes.byteLength !== length) {
        await this.#failOutbound(transfer, 'operation_failed');
        return;
      }

      const payload = { transferId, chunkIndex, offset, dataBase64: encodeCanonicalBase64(bytes) };
      this.#ports.send(createDevToolsV2Message('TRANSFER_CHUNK', payload, this.#envelope()));
      offset += length;
      chunkIndex += 1;
    }

    this.#ports.send(createDevToolsV2Message('TRANSFER_COMPLETE', { transferId }, this.#envelope()));
    await this.#closeOutbound(transfer);
  }

  /** 读一块字节；抛出等同于读不出来，两者在这一层没有可分支的差别。 */
  async #readChunk(source: DevToolsChunkSource, offset: number, length: number): Promise<Uint8Array | undefined> {
    try {
      return await source.read(offset, length);
    } catch {
      return undefined;
    }
  }

  /**
   * 本端读不下去了。
   *
   * @remarks
   * `ERROR` 与 `TRANSFER_CANCEL` 两条都要发：后者让面板丢掉已收到的部分（只发 ERROR 的话，
   * 面板的传输表要等到 idle 闸才回收，那段时间里半个文件一直挂着），前者给出归因。
   *
   * **顺序是 ERROR 在前**：这次下载的 `RESPONSE` 早已发出，面板那边这个 requestId 不再是
   * 一条在途请求，归因只能挂到那条传输上。CANCEL 先到就会让传输当场以「被取消」结算，
   * 随后到的 ERROR 无处可挂，一次磁盘读失败会被面板显示成一次用户取消。
   */
  async #failOutbound(transfer: OutboundTransfer, code: DevToolsErrorCode): Promise<void> {
    this.#sendError(transfer.requestId, createDevToolsError(code));
    this.#ports.send(
      createDevToolsV2Message('TRANSFER_CANCEL', { transferId: transfer.transferId }, this.#envelope())
    );
    await this.#closeOutbound(transfer);
  }

  /** 面板取消了一次下载：静默收尾，不回错误——它要的就是这个结果。 */
  #cancelOutbound(transferId: string): boolean {
    const transfer = this.#outbound.get(transferId);
    if (transfer === undefined) return false;

    void this.#closeOutbound(transfer);
    return true;
  }

  /** 总时长到点；计时器回调没有可以 await 的调用方，清理后台跑完即可。 */
  #expireOutbound(transferId: string): void {
    const transfer = this.#outbound.get(transferId);
    if (transfer === undefined) return;

    void this.#failOutbound(transfer, 'transfer_timeout');
  }

  async #closeOutbound(transfer: OutboundTransfer): Promise<void> {
    transfer.cancelTotal();
    this.#outbound.delete(transfer.transferId);
    this.#session?.settleTransfer(transfer.transferId);
    await this.#closeSource(transfer.source);
  }

  /** 释放读句柄；失败没有第二条补救路径，再抛一次只会逃到全局。 */
  async #closeSource(source: DevToolsChunkSource): Promise<void> {
    try {
      await source.close();
    } catch {
      // 无处可退：读句柄的兜底是进程退出，不是这里再报一次。
    }
  }

  #onTransferStart(payload: DevToolsTransferStartPayload): void {
    const authorization = authorizeOperation({
      capability: this.#ports.capability,
      mutationPolicy: this.#ports.mutationPolicy,
      descriptors: this.#ports.providers.descriptors,
      domain: TRANSFER_DOMAIN,
      operation: TRANSFER_OPERATION
    });
    if (authorization.outcome === 'silent-drop') return;
    if (authorization.outcome === 'rejected') {
      this.#sendError(payload.requestId, authorization.error);
      return;
    }

    const registration = this.#session?.registerTransfer(payload.transferId);
    if (registration === undefined) return;
    if (registration.outcome === 'rejected') {
      this.#sendError(payload.requestId, registration.error);
      return;
    }
    this.#openTransfer(payload);
  }

  /**
   * sink 在传输表接受之后才建立，被拒的 START 不留下任何临时产物。
   *
   * @remarks
   * 被拒时走 `releaseTransfer` 而不是 `settleTransfer`：这条传输从未开始，那个 ID
   * 也就没被用掉（理由见 `session.ts` 上的 TSDoc）。
   */
  #openTransfer(payload: DevToolsTransferStartPayload): void {
    const result = this.#transfers?.start(payload);
    if (result === undefined) return;
    if (result.outcome === 'rejected') {
      this.#session?.releaseTransfer(payload.transferId);
      this.#sendError(payload.requestId, result.error);
      return;
    }
    this.#transferBindings.set(payload.transferId, {
      requestId: payload.requestId,
      sink: this.#ports.providers.createChunkSink(payload.transferId)
    });
  }

  /**
   * CHUNK 帧。
   *
   * @remarks
   * `requestId` 在**结果回来之后**才取：写失败会顺带把传输结算掉，而结算会移除 binding，
   * 那时归因只剩 `null`。所以先记下它，再去等落盘。
   */
  async #onTransferChunk(payload: DevToolsTransferChunkPayload): Promise<void> {
    const requestId = this.#requestIdOf(payload.transferId);
    const result = await this.#transfers?.chunk(payload);
    if (result?.outcome === 'rejected') this.#sendError(requestId, result.error);
  }

  async #settleTransferFrame(payload: DevToolsTransferIdPayload, kind: 'complete' | 'cancel'): Promise<void> {
    const table = this.#transfers;
    if (table === null) return;

    const requestId = this.#requestIdOf(payload.transferId);
    const result = kind === 'complete' ? await table.complete(payload) : await table.cancel(payload);
    if (result.outcome === 'rejected') this.#sendError(requestId, result.error);
  }

  /**
   * 把一块字节交给 sink。
   *
   * @remarks
   * 失败**必须抛出去**而不是吞掉：传输表正是靠这次 reject 才知道这条传输已经写不下去，
   * 吞掉的话它会继续记账，最后 commit 一个缺块的文件。
   */
  async #onChunk(transferId: string, data: Uint8Array): Promise<void> {
    await this.#transferBindings.get(transferId)?.sink.write(data);
  }

  /**
   * 传输终态的统一收口。
   *
   * @remarks
   * `completed` 之外的任何终态都必须 `discard`——半写文件与孤儿元数据正是这里漏一条就产生的。
   * `commit` 自己失败时同样落到 discard：转正没成功，临时产物就还是临时产物，留着它等于
   * 让下一次启动去猜那是半个文件还是一个完整文件。
   */
  async #onTransferSettled(transferId: string, outcome: DevToolsTransferOutcome): Promise<void> {
    const binding = this.#transferBindings.get(transferId);
    this.#transferBindings.delete(transferId);
    this.#session?.settleTransfer(transferId);
    if (binding === undefined) return;

    if (outcome === 'idle-timeout' || outcome === 'total-timeout') {
      this.#sendError(binding.requestId, createDevToolsError('transfer_timeout'));
    }
    if (outcome !== 'completed') {
      await this.#discard(binding);
      return;
    }

    try {
      await binding.sink.commit();
    } catch {
      this.#sendError(binding.requestId, createDevToolsError('operation_failed'));
      await this.#discard(binding);
    }
  }

  /**
   * 清理一次传输的临时产物。
   *
   * @remarks
   * `discard` 自己失败没有第二条补救路径——再抛一次只会顺着计时器回调逃到全局。
   * 契约要求它幂等且尽力而为，这里把它当终点。
   */
  async #discard(binding: TransferBinding): Promise<void> {
    try {
      await binding.sink.discard();
    } catch {
      // 无处可退：临时产物的兜底是宿主启动时的清理，不是这里再报一次。
    }
  }

  #requestIdOf(transferId: string): string | null {
    return this.#transferBindings.get(transferId)?.requestId ?? null;
  }

  #openSession(): void {
    const negotiatedLimit = resolveNegotiatedTransferLimit(
      this.#ports.providers.descriptors
        .filter(descriptor => descriptor.domain === TRANSFER_DOMAIN)
        .map(descriptor => descriptor.limits.maxTransferBytes)
    );
    this.#negotiatedTransferLimit = negotiatedLimit ?? 0;
    this.#session = createDevToolsSession({
      sessionId: this.#negotiation.sessionId,
      clock: this.#ports.clock,
      onRequestTimeout: requestId => this.#sendError(requestId, createDevToolsError('request_timeout'))
    });
    this.#transfers = createDevToolsTransferTable({
      clock: this.#ports.clock,
      negotiatedLimit: this.#negotiatedTransferLimit,
      onChunk: (transferId, data) => this.#onChunk(transferId, data),
      onSettled: (transferId, outcome) => this.#onTransferSettled(transferId, outcome)
    });
    this.#subscribeToEvents();
  }

  /**
   * 事件订阅。
   *
   * @remarks
   * `none` 档**不建立订阅**，而不是「订阅了但不发」：后者仍会在 host 侧产生开销与副作用，
   * 也让「订阅数为 0」这条判据失去意义。
   *
   * 判据走完整的 {@link authorizeOperation} 而不是只看档位：事件是 `database.events`
   * 这个操作，与 REQUEST 打过来的同一个操作没有任何区别。只看档位就等于 descriptor 与
   * mutationPolicy 两层在这条路径上不存在 —— 一个声明 `unavailable` 的 database 领域，
   * 照样会被订阅触碰一次。
   */
  #subscribeToEvents(): void {
    const authorization = authorizeOperation({
      capability: this.#ports.capability,
      mutationPolicy: this.#ports.mutationPolicy,
      descriptors: this.#ports.providers.descriptors,
      domain: EVENT_DOMAIN,
      operation: EVENT_OPERATION
    });
    if (authorization.outcome === 'silent-drop') return;
    if (authorization.outcome === 'rejected') {
      this.#sendError(null, authorization.error);
      return;
    }
    this.#eventsAuthorized = true;
    void this.#openEventStream();
  }

  /**
   * 真正去 host 侧建立订阅。
   *
   * @remarks
   * 失败必须发出去，哪怕它没有 `requestId`（订阅不是任何一条 REQUEST 的结果，`null` 是
   * 它诚实的关联键）。把结果 `void` 掉的话，对端会一直等一条永远不会来的 EVENT，
   * 而 wire 上没有任何迹象说明它不会来。
   */
  async #openEventStream(): Promise<void> {
    const result = await this.#callProvider(EVENT_DOMAIN, EVENT_OPERATION, {});
    if (result.outcome === 'failed') this.#sendError(null, result.error);
  }

  #closeSession(): void {
    this.#eventsAuthorized = false;
    this.#transfers?.dispose();
    // 拆链路没有可以 await 的调用方；清理后台跑完即可，失败已在 #discard 内收口。
    for (const binding of this.#transferBindings.values()) void this.#discard(binding);
    this.#transferBindings.clear();
    // 出站方向同样要收：正在 `await read` 的 pump 会在下一次回到表里时发现自己已被摘掉。
    for (const transfer of [...this.#outbound.values()]) {
      transfer.cancelTotal();
      this.#outbound.delete(transfer.transferId);
      void this.#closeSource(transfer.source);
    }
    this.#session?.close();
    this.#transfers = null;
    this.#negotiatedTransferLimit = 0;
  }

  #sendError(requestId: string | null, error: DevToolsErrorPayload): void {
    this.#ports.send(createDevToolsV2Message('ERROR', { requestId, error }, this.#envelope()));
  }

  #sendResponse(requestId: string, result: unknown): void {
    this.#ports.send(createDevToolsV2Message('RESPONSE', { requestId, result }, this.#envelope()));
  }

  #sendPong(): void {
    this.#ports.send(createDevToolsV2Message('PONG', null, this.#envelope()));
  }

  /** 每帧一个新 sequence；`direction` 恒为下行，端点从不代 panel 发帧。 */
  #envelope(): DevToolsV2MessageOptions {
    return {
      sessionId: this.#negotiation.sessionId,
      sequence: this.#sequence.next(),
      timestamp: this.#ports.clock.now(),
      direction: 'connector-to-panel'
    };
  }
}

/**
 * 创建 connector 侧 v2 端点。
 *
 * @param ports - 收发、时钟、本地授权配置与 provider 接缝。
 * @returns 一个 {@link DevToolsConnectorEndpoint}。
 */
export function createDevToolsConnectorEndpoint(ports: DevToolsConnectorEndpointPorts): DevToolsConnectorEndpoint {
  return new DevToolsConnectorEndpointImpl(ports);
}
