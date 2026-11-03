/** 浏览器夹具页暴露给用例的 API；用例经 `page.evaluate` 调用 `window.p2pHarness`。 */
import type { P2PFileManifest } from '@aiao/rxdb-plugin-p2p-files';
import type { FileSpec, PeerName } from '../shared/fixtures.ts';

/** 夹具页的端口。 */
export const HARNESS_PORT = 4371;

/** 夹具里多声明的协议：只有开了 `probe` 的一端支持它。 */
export const PROBE_PROTOCOL = 'acceptance.probe';

/** 一个上下文的配置。 */
export interface HarnessOptions {
  /** 本上下文扮演的设备。 */
  readonly name: PeerName;
  /** 多声明 {@link PROBE_PROTOCOL}。 */
  readonly probe?: boolean;
  /** 心跳间隔（毫秒）。 */
  readonly heartbeatIntervalMs?: number;
  /** 心跳超时（毫秒）。 */
  readonly heartbeatTimeoutMs?: number;
  /** files 协议拒绝授权的内容哈希。 */
  readonly denied?: readonly string[];
}

/** 拉取完成的一个文件：整文件 SHA-256 应等于清单的 `contentHash`。 */
export interface PulledFile {
  readonly contentHash: string;
  readonly digest: string;
  readonly size: number;
}

/** 一次请求的结果。 */
export type RequestOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

/** 会话的结束原因。 */
export interface ClosedOutcome {
  readonly code: string;
  readonly peerReason: string | null;
  readonly message: string;
}

/** 会话就绪与否。 */
export type ReadyOutcome = { readonly ok: true; readonly peer: string } | ({ readonly ok: false } & ClosedOutcome);

/** 本端发出的一帧的摘要，按交给 DataChannel 的先后排列。 */
export interface TraceEntry {
  readonly kind: string;
  readonly id: number | null;
  readonly payloadBytes: number;
  readonly result: string | null;
}

/** 上下文的计数与状态。 */
export interface HarnessStats {
  /** 供块端读本地文件区间的次数。 */
  readonly reads: number;
  /** files 协议授权钩子被调用的次数。 */
  readonly authorizeCalls: number;
  /** 本端创建的 SDP offer 数。 */
  readonly offers: number;
  /** 本端创建的 SDP answer 数。 */
  readonly answers: number;
  /** 拉取已落盘的块数。 */
  readonly pulledChunks: number;
  /** {@link PROBE_PROTOCOL} 处理函数被调用的次数。 */
  readonly probes: number;
  /** 会话登记处当前保留的会话（按连接标识）。 */
  readonly sessions: readonly string[];
  /** 各连接的会话状态。 */
  readonly states: Readonly<Record<string, string>>;
}

/** `window.p2pHarness`。 */
export interface Harness {
  configure(options: HarnessOptions): void;
  /** 发起一条连接，返回整份 offer；`credential` 缺省为本端合法的凭据。 */
  createOffer(connectionId: string, credential?: string): Promise<string>;
  /** 响应一条连接，返回整份 answer。 */
  acceptOffer(connectionId: string, offer: string): Promise<string>;
  acceptAnswer(connectionId: string, answer: string): Promise<void>;
  ready(connectionId: string): Promise<ReadyOutcome>;
  closed(connectionId: string): Promise<ClosedOutcome>;
  hold(files: readonly FileSpec[], readDelayMs?: number): Promise<readonly P2PFileManifest[]>;
  pull(
    connectionId: string,
    manifests: readonly P2PFileManifest[],
    concurrency?: number
  ): Promise<readonly PulledFile[]>;
  /** 开始拉取但不等完成；用 {@link Harness.finishPull} 取结果。 */
  startPull(connectionId: string, manifests: readonly P2PFileManifest[], concurrency?: number): void;
  /** 等到拉取已落盘至少 `chunks` 个块。 */
  waitPulledChunks(chunks: number): Promise<void>;
  finishPull(): Promise<readonly PulledFile[]>;
  requestChunk(connectionId: string, manifest: P2PFileManifest): Promise<RequestOutcome>;
  probe(connectionId: string, protocol: string): Promise<RequestOutcome>;
  gateAuthorize(): void;
  /** 等到有一个授权调用停在闸门上。 */
  authorizeWaiting(): Promise<void>;
  releaseAuthorize(): void;
  /** 关上发送闸：会话交给 DataChannel 的下一帧停在闸口，其后的帧留在会话自己的发送队列里。 */
  gateSends(): void;
  releaseSends(): void;
  startRequest(connectionId: string, manifest: P2PFileManifest): void;
  cancelRequest(): Promise<string>;
  stats(): HarnessStats;
  trace(connectionId: string): readonly TraceEntry[];
}

declare global {
  interface Window {
    p2pHarness: Harness;
  }
}
