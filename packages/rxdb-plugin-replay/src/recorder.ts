import type { eventWithTime } from '@rrweb/types';
import type { recordOptions } from 'rrweb';
import { REPLAY_MARKER_TAGS, type ReplayMarkerPayloads, type ReplayTruncatedCode } from './markers.js';
import type { ResolvedReplayOptions, RxDBReplayRecordOptions } from './options.js';
import type { ReplayAppendResult, ReplayEventEntry } from './store.js';

/**
 * rrweb `record` 的结构子集：录制器只用到启动与 `addCustomEvent`。
 *
 * @remarks
 * 写成结构类型而不是直接引 rrweb 的值，是为了让 rrweb 只经 `import('rrweb')` 按需加载，测试也能塞假的进来。
 */
export interface ReplayRecordFn {
  (options: recordOptions<eventWithTime>): (() => void) | undefined;
  addCustomEvent<Payload>(tag: string, payload: Payload): void;
}

/** 录制器的落库端（`ReplayStore` 满足它）。 */
export interface ReplayRecorderSink {
  appendBatch(sessionId: string, entries: readonly ReplayEventEntry[]): Promise<ReplayAppendResult>;
  markStopped(sessionId: string): Promise<void>;
}

/** 录制器提前结束的原因：超限截断，或冲刷 / 收尾失败。 */
export type ReplayRecorderEnd =
  | { readonly kind: 'truncated'; readonly code: ReplayTruncatedCode }
  | { readonly kind: 'error'; readonly error: Error };

/** {@link ReplayRecorder} 的构造参数。 */
export interface ReplayRecorderOptions {
  readonly sink: ReplayRecorderSink;
  readonly record: ReplayRecordFn;
  readonly sessionId: string;
  /** 第一条事件的 `seq`；新会话为 0，续录时取会话行与暂存里较大的那个。 */
  readonly nextSeq: number;
  readonly flush: ResolvedReplayOptions['flush'];
  readonly recordOptions: RxDBReplayRecordOptions;
  /** 截断或失败时调用一次；之后录制器不再收事件。 */
  readonly onEnd: (end: ReplayRecorderEnd) => void;
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * 一个会话的录制循环：rrweb `emit` → 分配 `seq` → 缓冲 → 分批落库。
 *
 * @remarks
 * 节奏照 `git show 2e820521:specs/005-us-909-session-replay/research.md` D5：攒满 `maxEvents` 或距缓冲开始 `intervalMs` 就冲刷，
 * 同一时刻至多一笔在途。冲刷失败或超限即停 rrweb、报一次结局，不重试。
 */
export class ReplayRecorder {
  readonly #options: ReplayRecorderOptions;
  #nextSeq: number;
  #buffer: ReplayEventEntry[] = [];
  #inFlightBatch: readonly ReplayEventEntry[] = [];
  #inFlight: Promise<void> | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #stopRecording: (() => void) | null = null;
  #accepting = false;
  #stopping = false;
  #end: ReplayRecorderEnd | null = null;

  get sessionId(): string {
    return this.#options.sessionId;
  }

  /** 下一个要分配的 `seq`。 */
  get nextSeq(): number {
    return this.#nextSeq;
  }

  constructor(options: ReplayRecorderOptions) {
    this.#options = options;
    this.#nextSeq = options.nextSeq;
  }

  /**
   * 调 rrweb `record()` 开始收事件（rrweb 会先同步发一条全量快照）。
   *
   * @throws Error rrweb 没有返回停止句柄（它在内部吞掉了启动异常）
   */
  start(): void {
    this.#accepting = true;
    const stop = this.#options.record({ ...this.#options.recordOptions, emit: event => this.#push(event) });
    if (stop === undefined) {
      this.#accepting = false;
      throw new Error('[rxdb-plugin-replay] rrweb record() did not start');
    }
    this.#stopRecording = stop;
  }

  /** 尚未确认落库的事件（在途批 + 缓冲），按 `seq` 升序；刷新暂存用。 */
  pending(): ReplayEventEntry[] {
    return [...this.#inFlightBatch, ...this.#buffer];
  }

  /** 在录像里记一个 commit 标记（经 rrweb，时间戳与 DOM 事件同源）。 */
  addCommitMarker(payload: ReplayMarkerPayloads[typeof REPLAY_MARKER_TAGS.commit]): void {
    if (!this.#accepting) return;
    this.#options.record.addCustomEvent(REPLAY_MARKER_TAGS.commit, payload);
  }

  /**
   * 停 rrweb → 等在途冲刷 → 冲刷剩余 → 会话行置 `stopped`。
   *
   * @remarks
   * 已截断时只停 rrweb，不再改会话行（它已是终态）。
   *
   * @throws 冲刷或改会话行失败时抛原错误（同时经 `onEnd` 报 `error`）
   */
  async stop(): Promise<void> {
    this.#stopping = true;
    this.#halt();
    await this.#drain();
    if (this.#end?.kind === 'error') throw this.#end.error;
    if (this.#end?.kind === 'truncated') return;
    try {
      await this.#options.sink.markStopped(this.sessionId);
    } catch (error) {
      this.#finish({ kind: 'error', error: toError(error) });
      throw error;
    }
  }

  #push(event: eventWithTime): void {
    if (!this.#accepting) return;
    this.#buffer.push({ seq: this.#nextSeq, event });
    this.#nextSeq += 1;
    this.#schedule();
  }

  #schedule(): void {
    if (this.#stopping || this.#end !== null || this.#buffer.length === 0) return;
    if (this.#buffer.length >= this.#options.flush.maxEvents) {
      this.#flush();
      return;
    }
    this.#timer ??= setTimeout(() => {
      this.#timer = null;
      this.#flush();
    }, this.#options.flush.intervalMs);
  }

  #flush(): void {
    if (this.#inFlight !== null || this.#buffer.length === 0 || this.#end !== null) return;
    this.#clearTimer();
    const batch = this.#buffer;
    this.#buffer = [];
    this.#inFlightBatch = batch;
    this.#inFlight = this.#write(batch);
  }

  async #write(batch: readonly ReplayEventEntry[]): Promise<void> {
    try {
      const result = await this.#options.sink.appendBatch(this.sessionId, batch);
      if (result.kind === 'truncated') this.#finish({ kind: 'truncated', code: result.code });
    } catch (error) {
      this.#finish({ kind: 'error', error: toError(error) });
    } finally {
      this.#inFlight = null;
      this.#inFlightBatch = [];
    }
    this.#schedule();
  }

  async #drain(): Promise<void> {
    while (this.#inFlight !== null || (this.#buffer.length > 0 && this.#end === null)) {
      this.#flush();
      await this.#inFlight;
    }
  }

  #finish(end: ReplayRecorderEnd): void {
    if (this.#end !== null) return;
    this.#end = end;
    this.#halt();
    this.#buffer = [];
    this.#options.onEnd(end);
  }

  #halt(): void {
    this.#accepting = false;
    this.#clearTimer();
    this.#stopRecording?.();
    this.#stopRecording = null;
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
