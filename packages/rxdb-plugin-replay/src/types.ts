import type { eventWithTime } from '@rrweb/types';
import type { Observable } from 'rxjs';
import type { ReplaySessionStatus } from './entities.js';
import type { ReplayTruncatedCode } from './markers.js';

/** `restoreToCommit()` 被拒的四种原因（与工作树 `restore()` 的 `reason` 同值）。 */
export type ReplayRestoreRejection = 'conflict' | 'dirty_working_tree' | 'incompatible_schema' | 'unreachable_target';

/**
 * `restoreToCommit()` 的结果：工作树 `restore()` 结果里回放用得上的那部分。
 *
 * @remarks
 * 不直接引用 `@aiao/rxdb-plugin-working-tree` 的 `WorkingTreeRestoreResult`：它是可选 peer，类型导入一旦进了
 * 公开签名就会留在 `.d.ts` 里，没装它的 strict 消费方连录制都编不过。被拒时的诊断细节（`conflict` / `incompatible`）
 * 运行时仍在对象上，要类型就直接用工作树的 `restore()`。
 */
export type ReplayRestoreResult =
  | {
      readonly ok: true;
      /** 写进工作树的条目数；`0` 是一次 no-op */
      readonly restoredCount: number;
      /** 本次建立的恢复会话 id；no-op 时为 `null` */
      readonly sessionId: string | null;
      /** 本次调用之后的工作树 revision */
      readonly workingTreeRevision: number;
    }
  | { readonly ok: false; readonly reason: ReplayRestoreRejection };

/**
 * `rxdb.replay.state$` 的值。
 *
 * @remarks
 * 初始 `idle`；作用域释放后不再发值（流完成）。转移表见 `specs/005-us-909-session-replay/data-model.md` §3.2。
 */
export type ReplayState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'recording'; readonly sessionId: string }
  | { readonly kind: 'truncated'; readonly sessionId: string; readonly code: ReplayTruncatedCode }
  | { readonly kind: 'error'; readonly sessionId: string | null; readonly error: Error };

/** 一个录制会话的概要（`listSessions()` / `exportSession()`）。 */
export interface ReplaySessionInfo {
  readonly id: string;
  readonly startedAt: Date;
  /** 最后一次成功落库那批里最大的事件时间戳；尚无事件时为 `null`。 */
  readonly lastEventAt: Date | null;
  readonly status: ReplaySessionStatus;
  /** `status === 'truncated'` 时必有，否则 `null`。 */
  readonly truncatedCode: ReplayTruncatedCode | null;
  /** 已落库事件数（含标记）。 */
  readonly eventCount: number;
  /** 已落库事件的字节数之和（`JSON.stringify` 后的 UTF-8 长度）。 */
  readonly bytes: number;
}

/** 录制库用量（`usage()`）。 */
export interface ReplayUsage {
  /** 全部会话 `bytes` 之和。 */
  readonly bytes: number;
  readonly sessionCount: number;
  readonly limits: { readonly sessionBytes: number; readonly storeBytes: number };
}

/** `exportSession()` 的结果：会话概要 + 按 `seq` 排好的全部事件。 */
export interface ReplaySessionExport {
  readonly format: 'aiao-rxdb-replay-session';
  readonly version: 1;
  readonly session: ReplaySessionInfo;
  readonly events: readonly eventWithTime[];
}

/** 录像里的一个 commit 标记（`listCommitMarkers()`）。 */
export interface ReplayCommitMarker {
  readonly seq: number;
  /** 标记事件的时间戳（epoch ms），即回放时间轴上的位置。 */
  readonly timestamp: number;
  readonly commitId: string;
  readonly branchId: string;
}

/** `readEvents()` 的时间区间（闭区间，epoch ms）。 */
export interface ReplayEventRange {
  readonly from: number;
  readonly to: number;
}

/**
 * 录制回放入口（`rxdb.replay`）。
 *
 * @remarks
 * 除 `state$` 外，所有成员在插件未安装（`connect()` 之前）或作用域已释放时 reject
 * `RxDBReplayError('not_installed')`。
 */
export interface ReplayManager {
  /** 录制状态；新订阅者立即收到当前值。 */
  readonly state$: Observable<ReplayState>;
  /**
   * 开始录制一个新会话。
   *
   * @returns 新会话 id
   * @throws `RxDBReplayError`：`no_dom`、`already_recording`、`store_limit`、`recording_db_unavailable`
   */
  start(): Promise<string>;
  /** 停止录制并冲刷剩余事件；未在录制时直接返回。冲刷失败时抛原错误。 */
  stop(): Promise<void>;
  /** 全部会话，`startedAt` 倒序。 */
  listSessions(): Promise<ReplaySessionInfo[]>;
  /**
   * 读一个会话的事件，`seq` 升序；给了区间则只读 `timestamp` 落在区间内的。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  readEvents(sessionId: string, range?: ReplayEventRange): Promise<eventWithTime[]>;
  /**
   * 会话里的 commit 标记，`seq` 升序。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  listCommitMarkers(sessionId: string): Promise<ReplayCommitMarker[]>;
  /**
   * 导出整个会话（可 `JSON.stringify` 后存档或分享）。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  exportSession(sessionId: string): Promise<ReplaySessionExport>;
  /**
   * 删除一个会话及其全部事件（同一事务）。这是释放录制库空间的唯一途径，插件从不自动删除。
   *
   * @throws `RxDBReplayError`：`session_recording`（正在录制）、`session_not_found`
   */
  deleteSession(sessionId: string): Promise<void>;
  /** 录制库当前用量与生效的上限。 */
  usage(): Promise<ReplayUsage>;
  /**
   * 把工作树恢复到某个 commit（取恢复前那一刻的新鲜凭据调 `workingTree.restore()`）。
   *
   * @throws `RxDBReplayError('working_tree_unavailable')`：没装工作树插件；其余错误原样透传
   */
  restoreToCommit(commitId: string): Promise<ReplayRestoreResult>;
}
