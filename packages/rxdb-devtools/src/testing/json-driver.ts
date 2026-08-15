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

/** 一次内存会话的可选装配，供后续段落接入真实状态机与 fake provider。 */
export interface JsonDriverEndpoints {
  /** panel 端点：拿到发送函数，返回收帧回调。 */
  readonly panel?: (send: (frame: DevToolsWireFrame) => void) => (frame: DevToolsWireFrame) => void;
  /** connector 端点：同上。 */
  readonly connector?: (send: (frame: DevToolsWireFrame) => void) => (frame: DevToolsWireFrame) => void;
  /** provider 探针；未装配时读取 `session.provider` 会抛错，而不是返回全 0。 */
  readonly provider?: DevToolsProviderProbe;
}

/** 未装配 provider 时抛出的说明；返回全 0 会让「调用次数为 0」的断言恒真。 */
const UNWIRED_PROVIDER = 'json driver: no provider probe was wired into this scenario';

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
  readonly #provider: DevToolsProviderProbe | undefined;

  get provider(): DevToolsProviderProbe {
    if (this.#provider === undefined) throw new RangeError(UNWIRED_PROVIDER);
    return this.#provider;
  }

  constructor(clock: DevToolsFakeClock, relay: FakeRelay, provider: DevToolsProviderProbe | undefined) {
    this.#clock = clock;
    this.#relay = relay;
    this.#provider = provider;
  }

  segment(segment: DevToolsRelaySegment): DevToolsSegmentProbe {
    return this.#relay.segment(segment);
  }

  async advanceTime(ms: number): Promise<void> {
    this.#clock.advance(ms);
    await this.#relay.settle();
  }

  async settle(): Promise<void> {
    await this.#relay.settle();
  }

  async dispose(): Promise<void> {
    await this.#relay.settle();
  }
}

/**
 * 创建一个内存 conformance driver。
 *
 * @param endpoints - 可选装配；缺省时四段只转发不产出，适合只验 transport 的套件。
 * @returns 可直接交给 `run*Suite` 的 driver。
 */
export function createJsonConformanceDriver(endpoints: JsonDriverEndpoints = {}): DevToolsConformanceDriver {
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

      relay.attach('panel', endpoints.panel ?? noopEndpoint);
      relay.attach('connector', endpoints.connector ?? noopEndpoint);

      return Promise.resolve(new JsonDriverSession(clock, relay, endpoints.provider));
    }
  };
}
