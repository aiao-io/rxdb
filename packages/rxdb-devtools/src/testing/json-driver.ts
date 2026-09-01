/**
 * @fileoverview 内存 conformance driver：JSON 文本 only，四段中继全在同一个进程里。
 *
 * @remarks
 * 它是 US-904 阶段 C / D 与 US-905 的对照组——同一份 suite 先在这里跑绿，再由下游的薄 driver
 * 在真实 `chrome.runtime.Port` / Electron IPC / Tauri `invoke` 上复跑。两边判据完全相同，
 * 差别只在 transport。
 *
 * 端点收发的**唯一表示是 JSON 文本**：`attach` 的回调签名收 `string`，任何试图借
 * structured clone 传 `Uint8Array` 的实现连编译都过不去。
 *
 * @module @aiao/rxdb-devtools/testing/json-driver
 */

import { createMessage } from '../types.js';
import type {
  DevToolsConformanceDriver,
  DevToolsConformanceScenario,
  DevToolsConformanceSession,
  DevToolsProviderProbe,
  DevToolsRelaySegment,
  DevToolsSegmentProbe,
  DevToolsWireFrame
} from './driver.js';
import type { DevToolsFakeClock } from './fake-clock.js';
import { createFakeClock } from './fake-clock.js';
import type { FakeRelayNode } from './fake-relay.js';
import { FakeRelay } from './fake-relay.js';

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

/**
 * 一次会话的中间两段装配。
 *
 * @remarks
 * 缺省时两段是纯转发（内存对照组）。装上真实实现时，**只换这两段**：时钟、探针、scenario 旋钮、
 * 排空策略与两端端点全部沿用同一份装配 —— AC#44 要的「没有平台副本」是靠这个结构成立的，
 * 不是靠约定。
 */
export interface JsonDriverNodes {
  /** background 段：真实的 service worker 中继逻辑。 */
  readonly background?: (forward: FakeRelayNode) => FakeRelayNode;
  /** content 段：真实的 content script 中继逻辑。 */
  readonly content?: (forward: FakeRelayNode) => FakeRelayNode;
  /**
   * 中间段自身的建链完成信号；`open` 会等它 settle 之后才让两端上线。
   *
   * @remarks
   * 真实中继在跑协议之前先要把自己的传输建起来（Chrome 要 connect port + 注入 content script，
   * Electron/Tauri 要开 IPC 通道）。这段编排跑在**宿主的真实微任务**上，而跳延迟跑在**假时钟**上，
   * 两条时间轴不交错：只要建链的续体落在一次 `advanceTime` 之后，它触发的那一跳就会等来
   * 一个不再前进的时钟——表现为「某条帧凭空消失」，且只在 `hopDelayMs > 0` 的用例上出现。
   *
   * 所以建链必须在 `open` 里收敛，而不是和协议帧抢时间轴。这不是给测试开的后门：
   * `open` 返回 Promise 的意义本来就是「拿到会话时 transport 已经就绪」。
   */
  readonly ready?: Promise<void>;
  /** 会话结束时释放中间段持有的资源。 */
  readonly dispose?: () => void;
}

/** 按 scenario 现装配中间两段。 */
export type JsonDriverNodeFactory = (context: JsonDriverContext) => JsonDriverNodes;

/** driver 的可选装配。 */
export interface JsonConformanceDriverOptions {
  /** 出现在测试名里的 driver 名；缺省 `'json'`。 */
  readonly name?: string;
  /** 中间两段的装配；缺省为纯转发。 */
  readonly createNodes?: JsonDriverNodeFactory;
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
  readonly #nodes: JsonDriverNodes;

  get provider(): DevToolsProviderProbe {
    const probe = this.#endpoints.provider;
    if (probe === undefined) throw new RangeError(UNWIRED_PROVIDER);
    return probe;
  }

  constructor(clock: DevToolsFakeClock, relay: FakeRelay, endpoints: JsonDriverEndpoints, nodes: JsonDriverNodes) {
    this.#clock = clock;
    this.#relay = relay;
    this.#endpoints = endpoints;
    this.#nodes = nodes;
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
    this.#nodes.dispose?.();
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
 * @param options - 可选装配：driver 名与中间两段的真实实现。
 * @returns 可直接交给 `run*Suite` 的 driver。
 */
export function createJsonConformanceDriver(
  createEndpoints: JsonDriverEndpointFactory = () => ({}),
  options: JsonConformanceDriverOptions = {}
): DevToolsConformanceDriver {
  return {
    name: options.name ?? 'json',
    open: async (scenario: DevToolsConformanceScenario): Promise<DevToolsConformanceSession> => {
      const clock = createFakeClock();
      const relay = new FakeRelay({
        clock,
        hopDelayMs: scenario.hopDelayMs,
        relayReadyDelayMs: scenario.relayReadyDelayMs,
        relayAcksLegacyHandshake: scenario.relayAcksLegacyHandshake,
        legacyAckFrame: legacyHandshakeAckFrame()
      });

      // 中间两段先于两端装配：panel 端点在 `attach` 里就会立刻发出第一条 HELLO，
      // 那一跳必须落到已经就位的中继节点上。顺序反了不会报错，只会让第一条 HELLO
      // 走纯转发路径 —— 一个只在首帧上出现的、极难追的差异。
      const nodes = options.createNodes?.({ scenario, clock }) ?? {};
      if (nodes.background) relay.attachNode('background', nodes.background);
      if (nodes.content) relay.attachNode('content', nodes.content);
      await nodes.ready;

      const endpoints = createEndpoints({ scenario, clock });
      relay.attach('panel', endpoints.panel ?? noopEndpoint);
      relay.attach('connector', endpoints.connector ?? noopEndpoint);

      return new JsonDriverSession(clock, relay, endpoints, nodes);
    }
  };
}
