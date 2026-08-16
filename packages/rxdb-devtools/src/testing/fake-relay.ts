/**
 * @fileoverview 四段中继的内存 fake：panel ↔ background ↔ content ↔ connector。
 *
 * @remarks
 * 只做 transport，不懂协议——唯一一处「懂协议」的例外是
 * {@link FakeRelayOptions.relayAcksLegacyHandshake}，它复刻的正是 AC#1 要防的旧 background
 * 行为：看到 HANDSHAKE 就自行合成 ACK，绕过 panel 的版本决策。
 *
 * **投递必须是异步的，哪怕 `hopDelayMs === 0`。** 若同步投递，「同一 tick 内补发 HELLO」
 * 这类断言恒真——每个 tick 都是同一个 tick。0 延迟走微任务，正延迟走注入的时钟：
 * 前者由 `settle()` 排空，后者必须由 `advanceTime()` 推进，两种时间因此不会互相污染
 * （`settle()` 绝不推进协议时间，否则等一次投递就可能顺带引爆 15 s 的请求超时）。
 *
 * @module @aiao/rxdb-devtools/testing/fake-relay
 */

import type { DevToolsClock } from '../v2/clock.js';
import type { DevToolsV2Direction } from '../v2/wire.js';
import type { DevToolsRelaySegment, DevToolsSegmentProbe, DevToolsWireFrame } from './driver.js';
import { DEVTOOLS_RELAY_SEGMENTS } from './driver.js';

/** 中继的构造条件。 */
export interface FakeRelayOptions {
  /** 协议与跳延迟共用的时钟端口。 */
  readonly clock: DevToolsClock;
  /** 每跳投递延迟，0 表示「下一个微任务」。 */
  readonly hopDelayMs: number;
  /** 中继就绪前的静默期，模拟等待 `chrome.permissions.request`；期间的帧全部排队。 */
  readonly relayReadyDelayMs: number;
  /** 是否复刻「旧 background 看到 HANDSHAKE 就代 ACK」的伪造行为。 */
  readonly relayAcksLegacyHandshake: boolean;
  /**
   * 代 ACK 时注入的原文。
   *
   * @remarks
   * 必填而非可选：可选就得在使用点补一句「没有就不伪造」的判断，那句判断会让
   * 「配了 `relayAcksLegacyHandshake: true` 却忘了给原文」的场景静默退化成「没有伪造」——
   * AC#1 / #5 于是恒绿。
   */
  readonly legacyAckFrame: DevToolsWireFrame;
}

/** 端点（panel / connector）的收帧回调。 */
export type FakeRelayEndpoint = (frame: DevToolsWireFrame) => void;

/** `settle()` 的微任务轮次上限；超过即判定为协议自激循环。 */
const SETTLE_ROUND_LIMIT = 1_000;

interface SegmentRecord {
  readonly sent: DevToolsWireFrame[];
  readonly received: DevToolsWireFrame[];
}

/** 帧沿链路前进的方向；下标增大为 panel → connector。 */
const DOWNSTREAM: DevToolsV2Direction = 'panel-to-connector';

function createRecords(): Map<DevToolsRelaySegment, SegmentRecord> {
  return new Map(DEVTOOLS_RELAY_SEGMENTS.map(segment => [segment, { sent: [], received: [] }]));
}

/** 四段中继的内存实现。 */
export class FakeRelay {
  readonly #options: FakeRelayOptions;
  readonly #records = createRecords();
  readonly #endpoints = new Map<DevToolsRelaySegment, FakeRelayEndpoint>();
  readonly #queuedUntilReady: (() => void)[] = [];
  #microtasksInFlight = 0;
  #ready: boolean;

  constructor(options: FakeRelayOptions) {
    this.#options = options;
    this.#ready = options.relayReadyDelayMs === 0;
    if (!this.#ready) {
      options.clock.setTimeout(() => this.#release(), options.relayReadyDelayMs);
    }
  }

  /**
   * 把一个端点接到链路两端之一。
   *
   * @remarks
   * 传工厂而不是回调，是因为端点需要 `send`、`send` 又需要端点已注册——传回调就必须留一个
   * 先声明后赋值的可变绑定。工厂让中继在同一步里完成两侧的装配。
   *
   * @param segment - 只能是 `panel` 或 `connector`；中间两段是纯转发，没有端点。
   * @param createEndpoint - 拿到发送函数、返回收帧回调的工厂。
   */
  attach(
    segment: 'panel' | 'connector',
    createEndpoint: (send: (frame: DevToolsWireFrame) => void) => FakeRelayEndpoint
  ): void {
    const direction: DevToolsV2Direction = segment === 'panel' ? DOWNSTREAM : 'connector-to-panel';
    const send = (frame: DevToolsWireFrame): void => {
      this.#record(segment).sent.push(frame);
      this.#forward(frame, direction, DEVTOOLS_RELAY_SEGMENTS.indexOf(segment));
    };
    this.#endpoints.set(segment, createEndpoint(send));
  }

  /**
   * 取某一段的观测与注入面。
   *
   * @param segment - 段标识。
   * @returns 该段的探针。
   */
  segment(segment: DevToolsRelaySegment): DevToolsSegmentProbe {
    const record = this.#record(segment);
    return {
      sent: record.sent,
      received: record.received,
      inject: async (frame, direction) => {
        record.sent.push(frame);
        this.#forward(frame, direction, DEVTOOLS_RELAY_SEGMENTS.indexOf(segment));
        await this.settle();
      }
    };
  }

  /**
   * 排空全部 0 延迟投递。
   *
   * @remarks
   * **不推进协议时间**：`hopDelayMs > 0` 的在途帧要靠 `advanceTime()` 送达。
   *
   * @throws RangeError 当微任务轮次超过上限，说明存在自激的收发循环。
   */
  async settle(): Promise<void> {
    for (let round = 0; round < SETTLE_ROUND_LIMIT; round += 1) {
      if (this.#microtasksInFlight === 0) return;
      await Promise.resolve();
    }
    throw new RangeError('fake relay: frames kept circulating past the settle limit');
  }

  /** 当前仍在等待投递的 0 延迟帧数量。 */
  pendingDeliveries(): number {
    return this.#microtasksInFlight;
  }

  #record(segment: DevToolsRelaySegment): SegmentRecord {
    const record = this.#records.get(segment);
    if (record === undefined) throw new RangeError(`fake relay: unknown segment ${segment}`);
    return record;
  }

  /** 中继就绪，放行静默期内排队的全部投递。 */
  #release(): void {
    this.#ready = true;
    const queued = this.#queuedUntilReady.splice(0);
    for (const deliver of queued) deliver();
  }

  /** 把帧从 `fromIndex` 向 `direction` 送一跳。 */
  #forward(frame: DevToolsWireFrame, direction: DevToolsV2Direction, fromIndex: number): void {
    const step = direction === DOWNSTREAM ? 1 : -1;
    const nextIndex = fromIndex + step;
    const next = DEVTOOLS_RELAY_SEGMENTS[nextIndex];
    if (next === undefined) return;

    this.#schedule(() => this.#deliver(frame, direction, nextIndex, next));
  }

  /** 把帧交给第 `index` 段：端点则回调，中间段则记录并继续转发。 */
  #deliver(
    frame: DevToolsWireFrame,
    direction: DevToolsV2Direction,
    index: number,
    segment: DevToolsRelaySegment
  ): void {
    const record = this.#record(segment);
    record.received.push(frame);

    const endpoint = this.#endpoints.get(segment);
    if (endpoint !== undefined) {
      endpoint(frame);
      return;
    }

    this.#forgeLegacyAck(segment, direction, frame);
    record.sent.push(frame);
    this.#forward(frame, direction, index);
  }

  /** 复刻旧 background 的越权行为：看到上行的 HANDSHAKE 就朝 panel 合成一条 ACK。 */
  #forgeLegacyAck(segment: DevToolsRelaySegment, direction: DevToolsV2Direction, frame: DevToolsWireFrame): void {
    if (!this.#options.relayAcksLegacyHandshake || segment !== 'background' || direction === DOWNSTREAM) return;
    if (!frame.includes('HANDSHAKE')) return;

    const forged = this.#options.legacyAckFrame;
    this.#record(segment).sent.push(forged);
    this.#schedule(() => this.#deliver(forged, DOWNSTREAM, 0, 'panel'));
  }

  /** 按 `hopDelayMs` 选择微任务或时钟定时器；就绪前一律排队。 */
  #schedule(deliver: () => void): void {
    if (!this.#ready) {
      this.#queuedUntilReady.push(deliver);
      return;
    }
    if (this.#options.hopDelayMs > 0) {
      this.#options.clock.setTimeout(deliver, this.#options.hopDelayMs);
      return;
    }
    this.#microtasksInFlight += 1;
    queueMicrotask(() => {
      this.#microtasksInFlight -= 1;
      deliver();
    });
  }
}
