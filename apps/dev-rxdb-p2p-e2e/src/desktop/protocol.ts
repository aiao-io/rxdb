/** 用例进程与对端进程之间的 IPC 消息。 */
import type { P2PFileManifest } from '@aiao/rxdb-plugin-p2p';
import type { FileSpec } from '../shared/fixtures.ts';

/** 用例发给对端进程的指令。 */
export type PeerCommand =
  | { readonly method: 'listen' }
  | { readonly method: 'connect'; readonly port: number }
  | { readonly method: 'ready' }
  | { readonly method: 'hold'; readonly files: readonly FileSpec[]; readonly readDelayMs?: number }
  | { readonly method: 'pull'; readonly manifests: readonly P2PFileManifest[] }
  | { readonly method: 'probe'; readonly protocol: string }
  | { readonly method: 'gate-authorize' }
  | { readonly method: 'release-authorize' }
  | { readonly method: 'start-request'; readonly manifest: P2PFileManifest }
  | { readonly method: 'cancel-request' }
  | { readonly method: 'stats' }
  | { readonly method: 'close' };

/** 拉取完成的一个文件：整文件 SHA-256 应等于清单的 `contentHash`。 */
export interface PulledFile {
  readonly contentHash: string;
  readonly digest: string;
  readonly size: number;
}

/** 对端进程的计数与状态。 */
export interface PeerStats {
  /** 供块端读本地文件区间的次数。 */
  readonly reads: number;
  /** files 协议授权钩子被调用的次数。 */
  readonly authorizeCalls: number;
  /** 建立过的 TLS 连接数。 */
  readonly connections: number;
  /** 会话状态。 */
  readonly state: string;
}

/** 每条指令的结果。 */
export interface PeerResults {
  readonly listen: { readonly port: number };
  readonly connect: { readonly connectionId: string };
  readonly ready: { readonly peer: string };
  readonly hold: { readonly manifests: readonly P2PFileManifest[] };
  readonly pull: { readonly files: readonly PulledFile[] };
  readonly probe: { readonly code: string };
  readonly 'gate-authorize': null;
  readonly 'release-authorize': null;
  readonly 'start-request': null;
  readonly 'cancel-request': { readonly outcome: string };
  readonly stats: PeerStats;
  readonly close: null;
}

/** 用例 → 对端进程。 */
export interface PeerRequest {
  readonly id: number;
  readonly command: PeerCommand;
}

/** 对端进程 → 用例：指令的结果。 */
export type PeerReply =
  | { readonly kind: 'reply'; readonly id: number; readonly result: unknown }
  | { readonly kind: 'reply'; readonly id: number; readonly error: string };

/** 对端进程 → 用例：主动通知。 */
export type PeerEvent =
  | { readonly kind: 'event'; readonly event: 'authorize-waiting' }
  | { readonly kind: 'event'; readonly event: 'authorize-cancelled' }
  | { readonly kind: 'event'; readonly event: 'session-closed'; readonly code: string };
