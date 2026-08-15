/**
 * @fileoverview conformance driver 接缝：US-904c / 904d / 905 复跑同一份断言的唯一接入点。
 *
 * @remarks
 * 驱动只描述 **transport 与探针**，不描述断言。断言全部住在 `*.suite.ts` 里，下游故事换掉的是
 * 四段中继的实现（`chrome.runtime.Port` / Electron IPC / Tauri `invoke`），不是判据。
 *
 * 两处刻意设计的「牙齿」：
 *
 * 1. **帧类型固定为 `string`（已序列化 JSON），不是 `unknown` 或 `object`。** structured clone
 *    能原样传 `Uint8Array`，JSON transport 不能。若接缝收对象，一个用 structured clone 的 fake
 *    driver 可以「验收通过」而真实 Port 上必然分叉；收字符串则 `Uint8Array` 连编译都过不去。
 * 2. **计数探针而不是沉默。** 「被拒调用为 0」类断言（AC#9 / #16 / #24）若只断言「没有响应消息」，
 *    在静默丢弃语义下**恒真**——静默丢弃本来就没有响应。判据必须是可读的计数器。
 *
 * @module @aiao/rxdb-devtools/testing/driver
 */

import type { DevToolsCapability } from '../types.js';
import type { DevToolsProviderDescriptor, DevToolsProviderRuntime } from '../provider/descriptor.js';
import type { DevToolsV2Direction } from '../v2/wire.js';

/**
 * 四段中继的段标识。
 *
 * @remarks
 * `background` / `content` 只转发、不产出 ACK——AC#1 要求的正是「旧 background 代 ACK 的行为
 * 必须被协议识别为伪造」，所以它们必须是可单独观测、可单独注入的段。
 */
export const DEVTOOLS_RELAY_SEGMENTS = ['panel', 'background', 'content', 'connector'] as const;

/** 四段中继的段标识。 */
export type DevToolsRelaySegment = (typeof DEVTOOLS_RELAY_SEGMENTS)[number];

/** 一帧 v2 wire。故意是 `string`：三端之间唯一有等价保证的表示是 JSON 文本。 */
export type DevToolsWireFrame = string;

/** 单段中继的观测与注入面。 */
export interface DevToolsSegmentProbe {
  /** 本段向外发出的帧，按发出顺序。 */
  readonly sent: readonly DevToolsWireFrame[];
  /** 本段收到的帧，按到达顺序。 */
  readonly received: readonly DevToolsWireFrame[];
  /**
   * 注入原文，绕过本段的正常产出；用于伪造 ACK、迟到握手、多余键（AC#8）。
   *
   * @remarks
   * `direction` 是必填的，不从帧内容推断：注入的原文常常**故意不是合法 JSON**
   * （wire hygiene 的负向用例），无法从中读出方向。让调用方显式指明，好过在这里放一条
   * 「解析失败就默认往下游走」的兜底——那条兜底会让路由错误伪装成协议拒绝。
   *
   * @param frame - 要注入的原文。
   * @param direction - 该帧的传播方向。
   */
  inject(frame: DevToolsWireFrame, direction: DevToolsV2Direction): Promise<void>;
}

/** 「被拒调用为 0」类断言的唯一凭据——断言计数器，不断言沉默。 */
export interface DevToolsProviderProbe {
  /** `${domain}.${operation}` → 调用次数（AC#9 / #16 / #24 断言为 0）。 */
  readonly operationCalls: ReadonlyMap<string, number>;
  /** OPFS / SQLite / WAL / 应用目录的读取次数。 */
  readonly hostReads: number;
  /** RxDB 事件订阅数；AC#9 的 `none` 档断言为 0。 */
  readonly eventSubscriptions: number;
  /** 事件缓冲区内的条目数；`none` 档断言为 0。 */
  readonly bufferedEvents: number;
  /** 单帧处理期间同时驻留的最大字节数；逐块处理应 ≤ 256 KiB（AC#19 的最佳代理）。 */
  readonly peakRetainedBytes: number;
  /**
   * 尚未清理的临时产物。
   *
   * @returns 任何终态（成功 / 失败 / 取消 / 超时）之后必须为空（AC#19 / #22）。
   */
  temporaryArtifacts(): Promise<readonly string[]>;
}

/** 一次 conformance 运行的固定条件。 */
export interface DevToolsConformanceScenario {
  /** connector owner 的本地可信档位。 */
  readonly capability: DevToolsCapability;
  /** `'omit'` 表示 owner 未为写操作单独开口，等价于只读。 */
  readonly mutationPolicy: 'allow' | 'omit';
  readonly panelProtocol: 'v1' | 'v2';
  readonly connectorProtocol: 'v1' | 'v2';
  /** relay 是否为「看到 HANDSHAKE 就代 ACK」的旧 background（AC#1 / #5）。 */
  readonly relayAcksLegacyHandshake: boolean;
  /**
   * 每跳投递延迟。
   *
   * @remarks
   * **必须存在 `> 0` 的用例。** 若 relay 同步投递，「同一 tick 内补发 HELLO」这类断言恒真——
   * 每个 tick 都是同一个 tick，断言什么也没验证。
   */
  readonly hopDelayMs: number;
  /** relay 就绪前的静默期，模拟等待 `chrome.permissions.request` 的无上界授权（AC#2）。 */
  readonly relayReadyDelayMs: number;
  readonly runtime: DevToolsProviderRuntime;
  readonly descriptors: readonly DevToolsProviderDescriptor[];
}

/** 一次已打开的 conformance 会话。 */
export interface DevToolsConformanceSession {
  /**
   * 取某一段的观测与注入面。
   *
   * @param segment - 段标识。
   * @returns 该段的探针。
   */
  segment(segment: DevToolsRelaySegment): DevToolsSegmentProbe;
  readonly provider: DevToolsProviderProbe;
  /**
   * 推进本 driver 掌管的全部协议计时器。
   *
   * @remarks
   * 不是 `vi.advanceTimersByTime`：同一份 suite 要在真实 Port / IPC 上复跑，那里 vitest
   * 接管不了宿主计时器。协议的六道 deadline 因此全部走注入的时钟端口。
   *
   * @param ms - 推进的毫秒数。
   */
  advanceTime(ms: number): Promise<void>;
  /** 等四段在途帧投递完（不推进协议时间）。 */
  settle(): Promise<void>;
  dispose(): Promise<void>;
}

/** 下游唯一需要实现的接缝。 */
export interface DevToolsConformanceDriver {
  /** 出现在测试名里的 driver 名，用于区分同一份 suite 的多次复跑。 */
  readonly name: string;
  /**
   * 按给定条件打开一次会话。
   *
   * @param scenario - 本次运行的固定条件。
   * @returns 已打开的会话。
   */
  open(scenario: DevToolsConformanceScenario): Promise<DevToolsConformanceSession>;
}

/** 一份最小可用的默认条件：`readonly` 档、v2 双端、异步投递。 */
export const DEVTOOLS_DEFAULT_SCENARIO: DevToolsConformanceScenario = {
  capability: 'readonly',
  mutationPolicy: 'omit',
  panelProtocol: 'v2',
  connectorProtocol: 'v2',
  relayAcksLegacyHandshake: false,
  hopDelayMs: 0,
  relayReadyDelayMs: 0,
  runtime: 'browser',
  descriptors: []
};

/**
 * 在默认条件上打补丁，得到一份完整条件。
 *
 * @param overrides - 要覆盖的字段。
 * @returns 完整的运行条件。
 */
export function createScenario(overrides: Partial<DevToolsConformanceScenario> = {}): DevToolsConformanceScenario {
  return { ...DEVTOOLS_DEFAULT_SCENARIO, ...overrides };
}
