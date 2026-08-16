/**
 * @fileoverview 内存 conformance driver：JSON 文本 only，四段中继全在同一个进程里。
 *
 * @remarks
 * 它是 US-904c / 904d / 905 的对照组——同一份 suite 先在这里跑绿，再由下游的薄 driver
 * 在真实 `chrome.runtime.Port` / Electron IPC / Tauri `invoke` 上复跑。两边判据完全相同，
 * 差别只在 transport。
 *
 * 端点收发的**唯一表示是 JSON 文本**：`attach` 的回调签名收 `string`，任何试图借
 * structured clone 传 `Uint8Array` 的实现连编译都过不去。
 *
 * @module @aiao/rxdb-devtools/testing/json-driver
 */

import { createMessage } from '../types.js';
import { createFakeClock } from './fake-clock.js';
import type { DevToolsFakeClock } from './fake-clock.js';
import { FakeRelay } from './fake-relay.js';
import type {
  DevToolsConformanceDriver,
  DevToolsConformanceScenario,
  DevToolsConformanceSession,
  DevToolsProviderProbe,
  DevToolsRelaySegment,
  DevToolsSegmentProbe,
  DevToolsWireFrame
} from './driver.js';

/**
 * 一次会话的装配上下文。
 *
 * @remarks
 * 装配必须**按 scenario 现算**，不能在 driver 构造时固定：capability、mutationPolicy、
 * descriptors 与协议版本都是逐用例变化的，而每次 `open` 还各有一只独立的假时钟。
 * 把端点固定在 driver 上，等于让整套矩阵共用第一条用例的授权配置。
 */
export interface JsonDriverContext {
  /** 本次运行的固定条件。 */
  readonly scenario: DevToolsConformanceScenario;
  /** 本次会话的假时钟；端点的全部时限都必须走它。 */
  readonly clock: DevToolsFakeClock;
}

/** 按 scenario 现装配一次会话的两端与探针。 */
export type JsonDriverEndpointFactory = (context: JsonDriverContext) => JsonDriverEndpoints;

/** 一次内存会话的可选装配。 */
export interface JsonDriverEndpoints {
  /** panel 端点：拿到发送函数，返回收帧回调。 */
  readonly panel?: (send: (frame: DevToolsWireFrame) => void) => (frame: DevToolsWireFrame) => void;
  /** connector 端点：同上。 */
  readonly connector?: (send: (frame: DevToolsWireFrame) => void) => (frame: DevToolsWireFrame) => void;
  /** provider 探针；未装配时读取 `session.provider` 会抛错，而不是返回全 0。 */
  readonly provider?: DevToolsProviderProbe;
  /** 会话结束时释放端点持有的计时器与传输。 */
  readonly dispose?: () => void;
}

/** 未装配 provider 时抛出的说明；返回全 0 会让「调用次数为 0」的断言恒真。 */
const UNWIRED_PROVIDER = 'json driver: no provider probe was wired into this scenario';

/** `#drain` 的轮次上限；超出即判定为端点之间的往返不收敛。 */
const DRAIN_ROUND_LIMIT = 64;

/** 跨一个宏任务，把 promise 链上排队的续体放行。 */
function macrotask(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

function noopEndpoint(): (frame: DevToolsWireFrame) => void {
  return () => undefined;
}

/**
 * 旧 background 代发的那条 ACK。
 *
 * @remarks
 * 它是一条**挑不出毛病的 v1 `HANDSHAKE_ACK`**——危险正在于此：协议不可能靠格式识破它，
 * 只能靠「ACK 由 panel 独占产出」这条所有权规则。
 */
function legacyHandshakeAckFrame(): DevToolsWireFrame {
  return JSON.stringify(createMessage('HANDSHAKE_ACK', 'devtools-to-page', null, 0));
}

class JsonDriverSession implements DevToolsConformanceSession {
  readonly #clock: DevToolsFakeClock;
  readonly #relay: FakeRelay;
  readonly #endpoints: JsonDriverEndpoints;

  get provider(): DevToolsProviderProbe {
    const probe = this.#endpoints.provider;
    if (probe === undefined) throw new RangeError(UNWIRED_PROVIDER);
    return probe;
  }

  constructor(clock: DevToolsFakeClock, relay: FakeRelay, endpoints: JsonDriverEndpoints) {
    this.#clock = clock;
    this.#relay = relay;
    this.#endpoints = endpoints;
  }

  segment(segment: DevToolsRelaySegment): DevToolsSegmentProbe {
    return this.#relay.segment(segment);
  }

  async advanceTime(ms: number): Promise<void> {
    this.#clock.advance(ms);
    await this.#drain();
  }

  async settle(): Promise<void> {
    await this.#drain();
  }

  async dispose(): Promise<void> {
    await this.#drain();
    this.#endpoints.dispose?.();
  }

  /**
   * 排空「中继在途帧」与「端点内 `await provider.invoke()` 续体」两条独立队列。
   *
   * @remarks
   * relay 自己的 `settle()` 只数它排的微任务；端点在 provider promise 上挂的续体不在其中。
   * 只等 relay 会在 RESPONSE 帧尚未产生时就返回，于是「provider 被调用了但没有响应」这类缺陷
   * 反而测出「没有响应」的绿。所以必须交替 relay 排空与宏任务跳跃，直到两条队列同时为空。
   */
  async #drain(): Promise<void> {
    for (let round = 0; round < DRAIN_ROUND_LIMIT; round += 1) {
      await this.#relay.settle();
      await macrotask();
      if (this.#relay.pendingDeliveries() === 0) return;
    }
    throw new RangeError('json driver: endpoints kept exchanging frames past the drain limit');
  }
}

/**
 * 创建一个内存 conformance driver。
 *
 * @param createEndpoints - 按 scenario 现装配两端与探针；缺省时四段只转发不产出，
 *   适合只验 transport 的套件。
 * @returns 可直接交给 `run*Suite` 的 driver。
 */
export function createJsonConformanceDriver(
  createEndpoints: JsonDriverEndpointFactory = () => ({})
): DevToolsConformanceDriver {
  return {
    name: 'json',
    open: (scenario: DevToolsConformanceScenario): Promise<DevToolsConformanceSession> => {
      const clock = createFakeClock();
      const relay = new FakeRelay({
        clock,
        hopDelayMs: scenario.hopDelayMs,
        relayReadyDelayMs: scenario.relayReadyDelayMs,
        relayAcksLegacyHandshake: scenario.relayAcksLegacyHandshake,
        legacyAckFrame: legacyHandshakeAckFrame()
      });

      const endpoints = createEndpoints({ scenario, clock });
      relay.attach('panel', endpoints.panel ?? noopEndpoint);
      relay.attach('connector', endpoints.connector ?? noopEndpoint);

      return Promise.resolve(new JsonDriverSession(clock, relay, endpoints));
    }
  };
}
