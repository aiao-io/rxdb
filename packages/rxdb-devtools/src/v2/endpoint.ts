/**
 * @fileoverview connector 侧 v2 端点：把协商、session、传输表、授权与 provider 派发接成一条链路。
 *
 * @remarks
 * 分散的状态机各自都能单测，但**它们之间的接线本身才是协议**：授权排在登记之前（被拒的调用
 * 不得占用预算）、登记排在 provider 调用之前（越限的请求不得触碰 host）、迟到的结果必须先过
 * session 的结算门（超时或轮换后的响应不得进入新状态）。这些顺序在任何单个模块里都看不出来，
 * 只有在这里才成立或失效，所以它是产品代码而不是测试脚手架——US-904c 的 Chrome driver 与
 * US-904d / US-905 的原生 driver 复用的正是这份接线。
 *
 * panel 侧只导出协商机（见 `negotiation-panel`）：数据面客户端归 US-904c，本模块不预判它的形状。
 *
 * @module @aiao/rxdb-devtools/v2/endpoint
 */

import { SequenceGenerator } from '../sequence.js';
import type { AnyDevToolsMessage, DevToolsCapability } from '../types.js';
import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from '../provider/descriptor.js';
import { resolveNegotiatedTransferLimit } from '../provider/limits.js';
import type { DevToolsChunkSink, DevToolsProvider } from '../provider/types.js';
import { authorizeMessage, authorizeOperation } from './authorization.js';
import type { DevToolsMutationPolicy } from './authorization.js';
import type { DevToolsClock } from './clock.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsErrorPayload } from './errors.js';
import { createConnectorNegotiation } from './negotiation-connector.js';
import type { DevToolsConnectorNegotiation, DevToolsConnectorNegotiationMessage } from './negotiation-connector.js';
import { createDevToolsSession } from './session.js';
import type { DevToolsSession } from './session.js';
import { createDevToolsTransferTable } from './transfer.js';
import type { DevToolsTransferOutcome, DevToolsTransferTable } from './transfer.js';
import { createDevToolsV2Message, isDevToolsV2Envelope, isDevToolsV2Message } from './wire.js';
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
  /** 在途 transfer 数。 */
  readonly inflightTransfers: number;
  /** 发出 eager v1 握手，开始协商。 */
  start(): void;
  /** 处理一帧入站数据；非本协议的值一律忽略。 */
  receive(frame: unknown): void;
  /** 释放全部计时器、传输与订阅。 */
  dispose(): void;
}

/** 传输在本端点的归属信息；用于把终态归因到发起它的那条 REQUEST。 */
interface TransferBinding {
  readonly requestId: string;
  readonly sink: DevToolsChunkSink;
}

/**
 * 传输在本协议里只服务 `files.upload`。
 *
 * @remarks
 * `TRANSFER_START` 不带 domain/operation，但它并非无主：授权必须按它实际要做的事判定，
 * 否则 `readonly` 档只要绕开 REQUEST 直接发 START 就能写文件。
 */
const TRANSFER_DOMAIN = 'files' as const;
const TRANSFER_OPERATION = 'upload' as const;

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
  readonly #transferBindings = new Map<string, TransferBinding>();
  #session: DevToolsSession | null = null;
  #transfers: DevToolsTransferTable | null = null;

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
        this.#onTransferChunk(message.payload);
        return;
      case 'TRANSFER_COMPLETE':
        this.#settleTransferFrame(message.payload, 'complete');
        return;
      case 'TRANSFER_CANCEL':
        this.#settleTransferFrame(message.payload, 'cancel');
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

  async #invoke(payload: DevToolsRequestPayload): Promise<void> {
    const result = await this.#ports.providers.provider(payload.domain).invoke(payload.operation, payload.params);
    // 结算门同时挡住两件事：已超时的请求，以及 session 轮换后迟到的结果。
    if (this.#session?.settleRequest(payload.requestId) !== true) return;

    if (result.outcome === 'failed') this.#sendError(payload.requestId, result.error);
    else this.#sendResponse(payload.requestId, result.result);
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

  /** sink 在传输表接受之后才建立，被拒的 START 不留下任何临时产物。 */
  #openTransfer(payload: DevToolsTransferStartPayload): void {
    const result = this.#transfers?.start(payload);
    if (result === undefined) return;
    if (result.outcome === 'rejected') {
      this.#session?.settleTransfer(payload.transferId);
      this.#sendError(payload.requestId, result.error);
      return;
    }
    this.#transferBindings.set(payload.transferId, {
      requestId: payload.requestId,
      sink: this.#ports.providers.createChunkSink(payload.transferId)
    });
  }

  #onTransferChunk(payload: DevToolsTransferChunkPayload): void {
    const result = this.#transfers?.chunk(payload);
    if (result?.outcome === 'rejected') this.#sendError(this.#requestIdOf(payload.transferId), result.error);
  }

  #settleTransferFrame(payload: DevToolsTransferIdPayload, kind: 'complete' | 'cancel'): void {
    const table = this.#transfers;
    if (table === null) return;

    const result = kind === 'complete' ? table.complete(payload) : table.cancel(payload);
    if (result.outcome === 'rejected') this.#sendError(this.#requestIdOf(payload.transferId), result.error);
  }

  #onChunk(transferId: string, data: Uint8Array): void {
    this.#transferBindings.get(transferId)?.sink.write(data);
  }

  /**
   * 传输终态的统一收口。
   *
   * @remarks
   * `completed` 之外的任何终态都必须 `discard`——半写文件与孤儿元数据正是这里漏一条就产生的。
   */
  #onTransferSettled(transferId: string, outcome: DevToolsTransferOutcome): void {
    const binding = this.#transferBindings.get(transferId);
    this.#transferBindings.delete(transferId);
    this.#session?.settleTransfer(transferId);
    if (binding === undefined) return;

    if (outcome === 'completed') binding.sink.commit();
    else binding.sink.discard();
    if (outcome === 'idle-timeout' || outcome === 'total-timeout') {
      this.#sendError(binding.requestId, createDevToolsError('transfer_timeout'));
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
    this.#session = createDevToolsSession({
      sessionId: this.#negotiation.sessionId,
      clock: this.#ports.clock,
      onRequestTimeout: requestId => this.#sendError(requestId, createDevToolsError('request_timeout'))
    });
    this.#transfers = createDevToolsTransferTable({
      clock: this.#ports.clock,
      negotiatedLimit: negotiatedLimit ?? 0,
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
   */
  #subscribeToEvents(): void {
    if (!authorizeMessage('EVENT', this.#ports.capability)) return;

    void this.#ports.providers.provider('database').invoke('events', {});
  }

  #closeSession(): void {
    this.#transfers?.dispose();
    for (const binding of this.#transferBindings.values()) binding.sink.discard();
    this.#transferBindings.clear();
    this.#session?.close();
    this.#transfers = null;
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
export function createDevToolsConnectorEndpoint(
  ports: DevToolsConnectorEndpointPorts
): DevToolsConnectorEndpoint {
  return new DevToolsConnectorEndpointImpl(ports);
}
