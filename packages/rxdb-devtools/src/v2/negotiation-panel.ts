/**
 * @fileoverview panel 侧的证据触发协商状态机：暂存、补发 HELLO、1,000 ms 决策窗口、
 * ACK 所有权、v1 facade 终态与降级标记。
 *
 * @remarks
 * **为什么窗口不以 panel 初始化为起点。** panel 打开时 inspected page 的 connector 可能尚未
 * bootstrap，content script 也可能还没注入——注入要等 `chrome.permissions.request` 的用户授权，
 * 耗时无上界。以 init 起算的计时器会在任何一条握手到达之前过期，让「双方都支持 v2」的组合
 * **稳定**退回 v1。因此窗口固定为证据触发：**首次暂存 legacy HANDSHAKE** 才开始计时。
 *
 * **为什么是 ports-only 工厂而不是持有 transport 的 client。** 面板侧收发抽象只允许暴露平台
 * 无关的收发与生命周期，不得出现 tab id / Port / window label / `invoke` / IPC 概念
 * （US-904c 的 token 契约），且共享 library 不能把 Chrome types 变成传递依赖。所以这里只收
 * 一个 `send` 回调和一个时钟端口，904c 用薄 driver 包一层。
 *
 * **ACK 的所有权属于 panel。** 中继看到 HANDSHAKE 就自行合成 ACK 会绕过版本决策——协议无法靠
 * 格式识破那条伪造 ACK（它形状完全合法），只能靠「唯有 panel 产出 ACK」这条所有权规则。
 *
 * @module @aiao/rxdb-devtools/v2/negotiation-panel
 */

import { RXDB_DEVTOOLS_MESSAGE, createMessage, isDevToolsMessage } from '../types.js';
import type { AnyDevToolsMessage, HandshakeAckMessage } from '../types.js';
import { SequenceGenerator } from '../sequence.js';
import { isRecord } from '../internal/guards.js';
import { DEVTOOLS_NEGOTIATION_WINDOW_MS, DEVTOOLS_PROTOCOL_VERSION_V2 } from './constants.js';
import type { DevToolsCancelTimer, DevToolsClock } from './clock.js';
import type { DevToolsErrorPayload } from './errors.js';
import { isSupportedVersionList } from './guards.js';
import { createDevToolsV2Message, isDevToolsV2Message } from './wire.js';
import type { DevToolsV2HandshakePayload, DevToolsV2Message } from './wire.js';

/**
 * panel 协商机的状态。
 *
 * @remarks
 * `idle` 已初始化但尚无任何握手证据；`awaiting` 已暂存 legacy 握手、窗口计时中；
 * `v2` 已建立 session；`v1-facade` 为终态，只有 transport 重连才重新协商。
 */
export type DevToolsPanelNegotiationState = 'idle' | 'awaiting' | 'v2' | 'v1-facade';

/** panel 协商机会发出的消息：v2 帧，或 v1 facade 里的 legacy ACK。 */
export type DevToolsPanelNegotiationMessage = DevToolsV2Message | HandshakeAckMessage;

/** panel 协商机的构造端口。 */
export interface DevToolsPanelNegotiationPorts {
  /** 出站回调；由 904c 的薄 driver 接到具体 transport 上。 */
  readonly send: (message: DevToolsPanelNegotiationMessage) => void;
  /** 1,000 ms 决策窗口的唯一计时来源。 */
  readonly clock: DevToolsClock;
  /** 本端支持的协议版本；非空、严格降序、≤ 8 项，每项 1–255。缺省为 `[2, 1]`。 */
  readonly supportedVersions?: readonly number[];
}

/** panel 协商机。 */
export interface DevToolsPanelNegotiation {
  /** 当前状态。 */
  readonly state: DevToolsPanelNegotiationState;
  /** 协商成功后的 session；其余状态为 `null`。 */
  readonly sessionId: string | null;
  /** 已进入 v1 facade 却又看到对端其实会说 v2——提示用户重连以升级。 */
  readonly downgraded: boolean;
  /** 最近一次暂存的 legacy 握手；窗口内会被后到的握手替换。 */
  readonly stashedHandshake: AnyDevToolsMessage | null;
  /** 对端在协商期回报的错误，如 `protocol_unsupported`。 */
  readonly rejection: DevToolsErrorPayload | null;
  /** 被状态机拒绝的帧数；「拒绝」是可数的，「沉默」不是。 */
  readonly rejectedFrames: number;
  /**
   * 发出首个 `PROTOCOL_HELLO`。
   *
   * @throws TypeError 当重复启动或已 dispose 时。
   */
  start(): void;
  /**
   * 处理一帧入站消息。
   *
   * @param frame - 已解析、未校验的入站值。
   */
  receive(frame: unknown): void;
  /** 取消未决窗口并停止响应。 */
  dispose(): void;
}

/** 默认版本表：v2 优先，同时保留 v1 以便与旧 connector 走 facade。 */
const DEFAULT_SUPPORTED_VERSIONS: readonly number[] = [DEVTOOLS_PROTOCOL_VERSION_V2, 1];

/** v1 与 v2 帧共有的来源标记；据此把「不是发给本协议的帧」与「被拒帧」分开计数。 */
function claimsThisProtocol(frame: unknown): frame is Record<string, unknown> {
  return isRecord(frame) && frame['source'] === RXDB_DEVTOOLS_MESSAGE;
}

function isLegacyHandshake(frame: unknown): frame is AnyDevToolsMessage {
  return isDevToolsMessage(frame) && frame.type === 'HANDSHAKE';
}

class PanelNegotiation implements DevToolsPanelNegotiation {
  readonly #ports: DevToolsPanelNegotiationPorts;
  readonly #supportedVersions: readonly number[];
  readonly #sequence = new SequenceGenerator();

  #state: DevToolsPanelNegotiationState = 'idle';
  #sessionId: string | null = null;
  #downgraded = false;
  #stashedHandshake: AnyDevToolsMessage | null = null;
  #rejection: DevToolsErrorPayload | null = null;
  #rejectedFrames = 0;
  #cancelWindow: DevToolsCancelTimer | null = null;
  #windowOpened = false;
  #started = false;
  #disposed = false;

  get state(): DevToolsPanelNegotiationState {
    return this.#state;
  }

  get sessionId(): string | null {
    return this.#sessionId;
  }

  get downgraded(): boolean {
    return this.#downgraded;
  }

  get stashedHandshake(): AnyDevToolsMessage | null {
    return this.#stashedHandshake;
  }

  get rejection(): DevToolsErrorPayload | null {
    return this.#rejection;
  }

  get rejectedFrames(): number {
    return this.#rejectedFrames;
  }

  constructor(ports: DevToolsPanelNegotiationPorts) {
    const versions = ports.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS;
    if (!isSupportedVersionList(versions)) {
      throw new TypeError('rxdb-devtools: supportedVersions must be a non-empty descending list of 1–255');
    }
    this.#ports = ports;
    this.#supportedVersions = versions;
  }

  start(): void {
    if (this.#disposed) throw new TypeError('rxdb-devtools: panel negotiation is disposed');
    if (this.#started) throw new TypeError('rxdb-devtools: panel negotiation is already started');
    this.#started = true;
    this.#sendHello();
  }

  receive(frame: unknown): void {
    if (this.#disposed || !claimsThisProtocol(frame)) return;
    if (isLegacyHandshake(frame)) {
      this.#onLegacyHandshake(frame);
      return;
    }
    if (!isDevToolsV2Message(frame)) {
      this.#reject();
      return;
    }
    this.#onV2Message(frame);
  }

  dispose(): void {
    this.#closeWindow();
    this.#disposed = true;
  }

  /** 暂存 + 同 tick 补发 HELLO；窗口只在首次暂存时启动。 */
  #onLegacyHandshake(frame: AnyDevToolsMessage): void {
    if (this.#state === 'v2') {
      // session 已建立，迟到的握手按非法帧拒绝（AC#8），与「无 session 迟到握手」是两条路径。
      this.#reject();
      return;
    }
    if (this.#state === 'v1-facade') {
      // facade 是终态：不再补发 HELLO（版本已不可改），但 ACK 的所有权仍在 panel 手上——
      // 停止应答会让重新握手的 v1 connector 永远等下去。
      this.#sendLegacyAck();
      return;
    }

    this.#stashedHandshake = frame;
    this.#state = 'awaiting';
    this.#sendHello();
    if (!this.#windowOpened) this.#openWindow();
  }

  #onV2Message(message: DevToolsV2Message): void {
    if (message.type === 'HANDSHAKE') {
      this.#onV2Handshake(message.payload);
      return;
    }
    if (message.type === 'ERROR') {
      if (this.#state !== 'v2') this.#rejection = message.payload.error;
      return;
    }
    // panel 自己方向的帧又回到 panel，只可能是回显或伪造——ACK 尤其如此。
    if (message.direction === 'panel-to-connector') this.#reject();
    // 其余上行帧属于 session 数据面，由 session 层路由，协商机不表态。
  }

  #onV2Handshake(payload: DevToolsV2HandshakePayload): void {
    if (this.#state === 'v1-facade') {
      // 对端其实会说 v2，但版本已定：只置降级标记提示重连，绝不中途切换或并存两个状态机。
      this.#downgraded = true;
      this.#reject();
      return;
    }
    if (this.#state === 'v2') {
      this.#reject();
      return;
    }

    this.#closeWindow();
    this.#stashedHandshake = null;
    this.#state = 'v2';
    this.#sessionId = payload.sessionId;
    this.#send(
      createDevToolsV2Message(
        'HANDSHAKE_ACK',
        { protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2, sessionId: payload.sessionId },
        { sessionId: payload.sessionId, sequence: this.#sequence.next(), timestamp: this.#ports.clock.now() }
      )
    );
  }

  #openWindow(): void {
    this.#windowOpened = true;
    this.#cancelWindow = this.#ports.clock.setTimeout(() => this.#enterFacade(), DEVTOOLS_NEGOTIATION_WINDOW_MS);
  }

  /** 窗口到期仍只有暂存的 legacy 握手：由 panel 发 legacy ACK 进入 v1 facade。 */
  #enterFacade(): void {
    this.#cancelWindow = null;
    this.#state = 'v1-facade';
    this.#sendLegacyAck();
  }

  #closeWindow(): void {
    this.#cancelWindow?.();
    this.#cancelWindow = null;
  }

  #sendHello(): void {
    this.#send(
      createDevToolsV2Message(
        'PROTOCOL_HELLO',
        { supportedVersions: this.#supportedVersions },
        { sessionId: null, sequence: this.#sequence.next(), timestamp: this.#ports.clock.now() }
      )
    );
  }

  #sendLegacyAck(): void {
    this.#send(createMessage('HANDSHAKE_ACK', 'devtools-to-page', null, this.#sequence.next()));
  }

  #send(message: DevToolsPanelNegotiationMessage): void {
    this.#ports.send(message);
  }

  #reject(): void {
    this.#rejectedFrames += 1;
  }
}

/**
 * 创建 panel 侧协商机。
 *
 * @remarks
 * 一个实例只服务一次 transport connection。重连必须重新创建——复用会让 v1 facade 的终态
 * 跨连接残留，而「终态」的边界正是重连。
 *
 * @param ports - 收发回调与时钟。
 * @returns 平台无关的协商机。
 * @throws TypeError 当 `supportedVersions` 不是合法版本表时。
 */
export function createPanelNegotiation(ports: DevToolsPanelNegotiationPorts): DevToolsPanelNegotiation {
  return new PanelNegotiation(ports);
}
