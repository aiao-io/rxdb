/**
 * @fileoverview connector 侧协商状态机：eager legacy 握手、逐次响应 HELLO、session 铸造与
 * ACK 校验。
 *
 * @remarks
 * **eager legacy HANDSHAKE 必须是第一条出站帧。** 旧面板只认这一条；把任何 v2 帧插到它前面，
 * v1 链路上就会多出一条它读不懂的消息。所以「何时发」由本模块掌管，「发什么」由 owner 提供
 * ——payload 里的 capability / 版本是 connector 的既有职责，本模块不重造。
 *
 * **每一条合法 HELLO 都要响应。** 已经发过 eager legacy 握手不构成「这条 HELLO 是重复消息」
 * 的理由：panel 的补发恰恰是为了对付「首个 HELLO 在 connector bootstrap 之前就已丢失」。
 *
 * **session 在构造时铸造一次，而不是逐条 HELLO 铸造。** 一次 transport connection 最多一个
 * session；逐条铸造会让两端各认一个——panel 接受第一条、connector 记住最后一条。同时协商期的
 * ERROR 帧也需要一个 session-bearing envelope（除 `PROTOCOL_HELLO` 外每一帧都必须带 UUID），
 * 所以身份必须早于第一条错误存在。
 *
 * @module @aiao/rxdb-devtools/v2/negotiation-connector
 */

import { RXDB_DEVTOOLS_MESSAGE, isDevToolsMessage } from '../types.js';
import type { AnyDevToolsMessage, DevToolsCapability } from '../types.js';
import { SequenceGenerator } from '../sequence.js';
import { isRecord } from '../internal/guards.js';
import { DEVTOOLS_PROTOCOL_VERSION_V2 } from './constants.js';
import type { DevToolsClock } from './clock.js';
import { createDevToolsError } from './errors.js';
import type { DevToolsControlPlaneErrorCode } from './errors.js';
import { isSupportedVersionList } from './guards.js';
import { createSessionId } from './ids.js';
import { createDevToolsV2Message, isDevToolsV2Envelope, isDevToolsV2Message } from './wire.js';
import type { DevToolsV2Message, DevToolsV2MessageOptions } from './wire.js';
import type { DevToolsProviderDescriptor } from '../provider/descriptor.js';

/**
 * connector 协商机的状态。
 *
 * @remarks
 * `announced` 已发出 eager legacy 握手；`offered` 已回应至少一条 HELLO、等待 ACK；
 * `v2` 已收到回显本端 session 的 ACK。
 */
export type DevToolsConnectorNegotiationState = 'idle' | 'announced' | 'offered' | 'v2';

/** connector 协商机会发出的消息：eager legacy 握手，或 v2 帧。 */
export type DevToolsConnectorNegotiationMessage = DevToolsV2Message | AnyDevToolsMessage;

/** connector 协商机的构造端口。 */
export interface DevToolsConnectorNegotiationPorts {
  /** 出站回调。 */
  readonly send: (message: DevToolsConnectorNegotiationMessage) => void;
  /** 时间戳来源。 */
  readonly clock: DevToolsClock;
  /** owner 本地可信配置的档位；在 HANDSHAKE 里只是**告知**，不是权限输入。 */
  readonly capability: DevToolsCapability;
  /** 本 session 存在的 provider descriptor。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  /** owner 构造的 eager v1 握手；本模块只决定它何时出门。 */
  readonly legacyHandshake: AnyDevToolsMessage;
  /** 本端支持的协议版本；缺省 `[2, 1]`——v1 由 eager legacy 握手兑现。 */
  readonly supportedVersions?: readonly number[];
}

/** connector 协商机。 */
export interface DevToolsConnectorNegotiation {
  /** 当前状态。 */
  readonly state: DevToolsConnectorNegotiationState;
  /** 本次 transport connection 的 session 身份，构造时即铸造。 */
  readonly sessionId: string;
  /** 与对端协商出的最高共同版本；无交集时为 `null`。 */
  readonly negotiatedVersion: number | null;
  /** 被状态机拒绝的帧数。 */
  readonly rejectedFrames: number;
  /**
   * 发出 eager legacy HANDSHAKE。
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
  /** 停止响应。 */
  dispose(): void;
}

const DEFAULT_SUPPORTED_VERSIONS: readonly number[] = [DEVTOOLS_PROTOCOL_VERSION_V2, 1];

/** 取两张降序版本表的最高共同版本。 */
function highestCommonVersion(mine: readonly number[], theirs: readonly number[]): number | null {
  for (const version of mine) {
    if (theirs.includes(version)) return version;
  }
  return null;
}

class ConnectorNegotiation implements DevToolsConnectorNegotiation {
  readonly #ports: DevToolsConnectorNegotiationPorts;
  readonly #supportedVersions: readonly number[];
  readonly #sequence = new SequenceGenerator();
  readonly #sessionId = createSessionId();

  #state: DevToolsConnectorNegotiationState = 'idle';
  #negotiatedVersion: number | null = null;
  #rejectedFrames = 0;
  #started = false;
  #disposed = false;

  get state(): DevToolsConnectorNegotiationState {
    return this.#state;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get negotiatedVersion(): number | null {
    return this.#negotiatedVersion;
  }

  get rejectedFrames(): number {
    return this.#rejectedFrames;
  }

  constructor(ports: DevToolsConnectorNegotiationPorts) {
    const versions = ports.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS;
    if (!isSupportedVersionList(versions)) {
      throw new TypeError('rxdb-devtools: supportedVersions must be a non-empty descending list of 1–255');
    }
    this.#ports = ports;
    this.#supportedVersions = versions;
  }

  start(): void {
    if (this.#disposed) throw new TypeError('rxdb-devtools: connector negotiation is disposed');
    if (this.#started) throw new TypeError('rxdb-devtools: connector negotiation is already started');
    this.#started = true;
    this.#state = 'announced';
    this.#ports.send(this.#ports.legacyHandshake);
  }

  receive(frame: unknown): void {
    if (this.#disposed) return;
    // v1 优先：既有 v1 帧由 connector 自身的 v1 路径处理，协商机不表态、也不计成被拒帧。
    if (!isRecord(frame) || frame['source'] !== RXDB_DEVTOOLS_MESSAGE || isDevToolsMessage(frame)) return;
    if (!isDevToolsV2Envelope(frame)) {
      // 外壳都不合法时不回 ERROR：错误帧本身要靠合法外壳承载，回它只会给伪造者一个放大器。
      this.#reject();
      return;
    }
    if (!isDevToolsV2Message(frame)) {
      this.#onMalformedPayload(frame.type);
      return;
    }
    this.#onMessage(frame);
  }

  dispose(): void {
    this.#disposed = true;
  }

  #onMessage(message: DevToolsV2Message): void {
    if (message.type === 'PROTOCOL_HELLO') {
      this.#onHello(message.payload.supportedVersions);
      return;
    }
    if (message.type === 'HANDSHAKE_ACK') {
      this.#onAck(message.payload.sessionId);
      return;
    }
    // 其余下行帧属于 session 数据面，由 session 层路由。
  }

  #onHello(theirVersions: readonly number[]): void {
    if (this.#state === 'v2') {
      // session 已建立，重复 HELLO 是迟到帧；无 session 时它走的是补发路径，不算非法。
      this.#reject();
      return;
    }

    const common = highestCommonVersion(this.#supportedVersions, theirVersions);
    if (common === null) {
      this.#sendError('protocol_unsupported', `supported versions: ${this.#supportedVersions.join(',')}`);
      return;
    }

    this.#negotiatedVersion = common;
    // 共同最高版本是 v1 时保持沉默：eager legacy 握手已是全部要约，再回错误就是谎报。
    if (common !== DEVTOOLS_PROTOCOL_VERSION_V2) return;

    this.#state = 'offered';
    this.#ports.send(
      createDevToolsV2Message(
        'HANDSHAKE',
        {
          protocolVersion: DEVTOOLS_PROTOCOL_VERSION_V2,
          sessionId: this.#sessionId,
          capabilities: { capability: this.#ports.capability, descriptors: this.#ports.descriptors }
        },
        this.#nextEnvelope()
      )
    );
  }

  #onAck(sessionId: string): void {
    // 未要约就 ACK、重复 ACK、回显他人 session——三者都在分配任何资源之前拒绝。
    if (this.#state !== 'offered' || sessionId !== this.#sessionId) {
      this.#reject();
      return;
    }
    this.#state = 'v2';
  }

  /** 外壳合法但 payload 过不了严 guard：这是「已识别的协商帧」，回结构化 `invalid_message`。 */
  #onMalformedPayload(type: string): void {
    this.#reject();
    if (type === 'PROTOCOL_HELLO') this.#sendError('invalid_message');
  }

  #sendError(code: DevToolsControlPlaneErrorCode, message?: string): void {
    const error = createDevToolsError(code, {
      retryable: false,
      ...(message === undefined ? {} : { message })
    });
    this.#ports.send(createDevToolsV2Message('ERROR', { requestId: null, error }, this.#nextEnvelope()));
  }

  /** 取下一个出站信封；**推进 sequence**，因此每条出站帧只能调用一次。 */
  #nextEnvelope(): DevToolsV2MessageOptions {
    return {
      sessionId: this.#sessionId,
      sequence: this.#sequence.next(),
      timestamp: this.#ports.clock.now()
    };
  }

  #reject(): void {
    this.#rejectedFrames += 1;
  }
}

/**
 * 创建 connector 侧协商机。
 *
 * @remarks
 * 一个实例只服务一次 transport connection：session 身份随实例铸造，重连必须重新创建。
 *
 * @param ports - 收发回调、时钟、本地可信配置与 eager legacy 握手。
 * @returns 平台无关的协商机。
 * @throws TypeError 当 `supportedVersions` 不是合法版本表时。
 */
export function createConnectorNegotiation(
  ports: DevToolsConnectorNegotiationPorts
): DevToolsConnectorNegotiation {
  return new ConnectorNegotiation(ports);
}
