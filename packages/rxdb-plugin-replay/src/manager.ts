import type { RxDB } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import type { eventWithTime } from '@rrweb/types';
import type { BehaviorSubject, Subscription } from 'rxjs';
import { RxDBReplayError } from './errors.js';
import { createReplayMarkerEvent, parseReplayMarker, REPLAY_MARKER_TAGS } from './markers.js';
import type { ResolvedReplayOptions } from './options.js';
import { ReplayRecorder, type ReplayRecorderEnd, type ReplayRecordFn } from './recorder.js';
import { hasWorkingTree, restoreToCommit } from './restore.js';
import {
  claimReplayStash,
  replayStashKey,
  unwrittenStashEvents,
  writeReplayStash,
  type ReplayStash
} from './resume.js';
import { ReplayStore, toInfo, type ReplayEventEntry } from './store.js';
import type {
  ReplayCommitMarker,
  ReplayEventRange,
  ReplayRestoreResult,
  ReplaySessionExport,
  ReplaySessionInfo,
  ReplayState,
  ReplayUsage
} from './types.js';

/** 按需加载 rrweb 的 `record`：录制开关关着的应用不该为它多下载一个字节。 */
export const loadRrwebRecord = async (): Promise<ReplayRecordFn> => (await import('rrweb')).record;

/** {@link ReplayRuntime} 的构造参数。 */
export interface ReplayRuntimeOptions {
  readonly rxdb: RxDB;
  readonly options: ResolvedReplayOptions;
  /** 门面持有的状态流；运行时只往里推值，完成它是门面的事。 */
  readonly state: BehaviorSubject<ReplayState>;
}

/** 页面级全局：浏览器主线程里就是 `window`。 */
type PageGlobal = typeof globalThis &
  Partial<Pick<Window, 'sessionStorage' | 'addEventListener' | 'removeEventListener'>>;

/**
 * `sessionStorage`，拿不到时为 `null`。
 *
 * @remarks
 * 经 `globalThis` 而不是 `window` 取：浏览器里两者是同一个对象，而 Worker / Node 里没有 `window`。
 * 沙箱 iframe 与关了存储的浏览器里，**读** `sessionStorage` 这个属性本身就会抛 `SecurityError`。
 * 那时只是没有刷新续录，录制本身照常。
 */
const pageStorage = (): Storage | null => {
  const page = globalThis as PageGlobal;
  if (typeof page.addEventListener !== 'function') return null;
  try {
    return page.sessionStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * 一个连接纪元里的 `rxdb.replay`：录制库、录制器、刷新续录与页面生命周期都挂在这里。
 *
 * @remarks
 * 纪元释放时由作用域的拆卸调用 {@link ReplayRuntime.release}：停录制 → 冲刷 → 销毁录制库。
 * 下一个纪元新建一个运行时，旧的不复用——录制库与录制器都跟着纪元走。
 */
export class ReplayRuntime {
  readonly #rxdb: RxDB;
  readonly #options: ResolvedReplayOptions;
  readonly #state: BehaviorSubject<ReplayState>;
  readonly #store: ReplayStore;
  readonly #storage: Storage | null = pageStorage();
  readonly #stashKey: string;
  #recorder: ReplayRecorder | null = null;
  #commits: Subscription | null = null;
  /** 进行中的 `start()`；`stop()` 与释放都要等它落定。 */
  #starting: Promise<unknown> | null = null;
  #stopping: Promise<void> | null = null;
  /** 安装时认领到暂存后在后台跑的续录。 */
  #resuming: Promise<void> = Promise.resolve();
  #released = false;

  constructor(options: ReplayRuntimeOptions) {
    this.#rxdb = options.rxdb;
    this.#options = options.options;
    this.#state = options.state;
    this.#store = new ReplayStore({
      createRecordingDb: options.options.createRecordingDb,
      limits: options.options.limits
    });
    this.#stashKey = replayStashKey(options.rxdb.config.dbName);
  }

  /**
   * 挂页面生命周期，认领刷新暂存（有就在后台续录）。
   *
   * @remarks
   * 认领是同步的：键必须在本页第一次 `pagehide` 之前删掉，否则这一页的暂存会和上一页的混在同一个键里。
   */
  install(scope: LifecycleScope): void {
    const storage = this.#storage;
    if (storage === null) return;
    scope.acquire(() => this.#watchPage(storage), 'replay:page-lifecycle');
    const claim = claimReplayStash(storage, this.#stashKey);
    if (claim.kind === 'invalid') {
      this.#state.next({ kind: 'error', sessionId: claim.sessionId, error: claim.error });
      return;
    }
    if (claim.kind === 'stash') this.#resuming = this.#resumeOrReport(claim.stash);
  }

  /**
   * 开始录一个新会话。
   *
   * @throws `RxDBReplayError`：`no_dom`、`already_recording`、`store_limit`、`recording_db_unavailable`、`not_installed`
   */
  async start(): Promise<string> {
    if (typeof document === 'undefined') {
      throw new RxDBReplayError('no_dom', 'recording needs a DOM; there is no `document` here');
    }
    this.#assertLive();
    await this.#resuming;
    this.#assertLive();
    if (this.#recorder !== null || this.#starting !== null) {
      throw new RxDBReplayError('already_recording', 'a session is already being recorded');
    }
    const starting = this.#startSession();
    this.#starting = starting;
    try {
      return await starting;
    } finally {
      this.#starting = null;
    }
  }

  /**
   * 停止当前录制并冲刷；没在录制时直接返回。冲刷失败抛原错误（`state$` 已转 `error`）。
   *
   * @remarks
   * 先等后台续录与进行中的 `start()` 落定（失败也算落定）：否则它们在 `stop()` 返回之后才起录制器，调用方以为停了其实还在录。
   */
  async stop(): Promise<void> {
    this.#stopping ??= this.#settleThenStop().finally(() => {
      this.#stopping = null;
    });
    return this.#stopping;
  }

  listSessions(): Promise<ReplaySessionInfo[]> {
    return this.#store.listSessions();
  }

  readEvents(sessionId: string, range?: ReplayEventRange): Promise<eventWithTime[]> {
    return this.#store.readEvents(sessionId, range);
  }

  async listCommitMarkers(sessionId: string): Promise<ReplayCommitMarker[]> {
    const entries = await this.#store.readCustomEntries(sessionId);
    return entries.flatMap(({ seq, event }) => {
      const marker = parseReplayMarker(event);
      if (marker?.tag !== REPLAY_MARKER_TAGS.commit) return [];
      return [{ seq, timestamp: event.timestamp, ...marker.payload }];
    });
  }

  async exportSession(sessionId: string): Promise<ReplaySessionExport> {
    const session = await this.#store.getSession(sessionId);
    if (session === null) {
      throw new RxDBReplayError('session_not_found', `session "${sessionId}" does not exist`);
    }
    const events = await this.#store.readEvents(sessionId);
    return { format: 'aiao-rxdb-replay-session', version: 1, session: toInfo(session), events };
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.#recorder?.sessionId === sessionId) {
      throw new RxDBReplayError('session_recording', `session "${sessionId}" is being recorded; stop() it first`);
    }
    await this.#store.deleteSession(sessionId);
  }

  async usage(): Promise<ReplayUsage> {
    return { ...(await this.#store.usage()), limits: this.#options.limits };
  }

  restoreToCommit(commitId: string): Promise<ReplayRestoreResult> {
    return restoreToCommit(this.#rxdb, commitId);
  }

  /**
   * 纪元释放：等续录与进行中的 `start()` 落定 → 停录制（冲刷）→ 销毁录制库。
   *
   * @remarks
   * 冲刷失败只进 `state$`（录制器已报 `error`），不打断拆卸：录制库照样要销毁，否则下个纪元的工厂会撞上没关的库。
   */
  async release(): Promise<void> {
    this.#released = true;
    await this.stop().catch(() => undefined);
    await this.#store.destroy();
  }

  async #startSession(): Promise<string> {
    const record = await loadRrwebRecord();
    const sessionId = await this.#store.createSession(new Date());
    try {
      this.#begin(record, sessionId, 0);
    } catch (error) {
      await this.#store.markStopped(sessionId);
      throw error;
    }
    return sessionId;
  }

  /** 起录制器、订阅 commit、转 `recording`。`record()` 没起来时同步抛，状态不动。 */
  #begin(record: ReplayRecordFn, sessionId: string, nextSeq: number): void {
    const recorder: ReplayRecorder = new ReplayRecorder({
      sink: this.#store,
      record,
      sessionId,
      nextSeq,
      flush: this.#options.flush,
      recordOptions: this.#options.record,
      onEnd: end => this.#onEnd(recorder, end)
    });
    recorder.start();
    this.#recorder = recorder;
    if (hasWorkingTree(this.#rxdb)) {
      this.#commits = this.#rxdb.workingTree.commits$.subscribe(event => recorder.addCommitMarker(event));
    }
    this.#state.next({ kind: 'recording', sessionId });
  }

  async #settleThenStop(): Promise<void> {
    await this.#resuming;
    await this.#starting?.catch(() => undefined);
    await this.#stopRecording();
  }

  async #stopRecording(): Promise<void> {
    const recorder = this.#recorder;
    if (recorder === null) return;
    this.#unsubscribeCommits();
    await recorder.stop();
    if (this.#recorder !== recorder) return;
    this.#recorder = null;
    this.#storage?.removeItem(this.#stashKey);
    this.#state.next({ kind: 'idle' });
  }

  /** 录制器提前结束（截断或冲刷失败）。旧录制器迟到的结局不算数。 */
  #onEnd(recorder: ReplayRecorder, end: ReplayRecorderEnd): void {
    if (this.#recorder !== recorder) return;
    this.#recorder = null;
    this.#unsubscribeCommits();
    const sessionId = recorder.sessionId;
    if (end.kind === 'error') {
      this.#state.next({ kind: 'error', sessionId, error: end.error });
      return;
    }
    this.#storage?.removeItem(this.#stashKey);
    this.#state.next({ kind: 'truncated', sessionId, code: end.code });
  }

  async #resumeOrReport(stash: ReplayStash): Promise<void> {
    try {
      await this.#resume(stash);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      this.#state.next({ kind: 'error', sessionId: stash.sessionId, error: cause });
    }
  }

  /**
   * 刷新续录（data-model §4）：补写暂存里还没落库的事件，在同一个会话上重新 `record()`。
   *
   * @remarks
   * 会话已不是 `recording`（刷新前已截断，或在别处被停）就不续，保持 `idle`。
   * 补写超限时会话就此截断，同样不再起录制器。
   */
  async #resume(stash: ReplayStash): Promise<void> {
    const session = await this.#store.getSession(stash.sessionId);
    if (session?.status !== 'recording' || this.#released) return;
    const record = await loadRrwebRecord();
    const entries = this.#stashEntries(stash, session.nextSeq);
    let written = session.nextSeq;
    if (entries.length > 0) {
      const result = await this.#store.appendBatch(stash.sessionId, entries);
      if (result.kind === 'truncated') {
        this.#state.next({ kind: 'truncated', sessionId: stash.sessionId, code: result.code });
        return;
      }
      written = result.nextSeq;
    }
    this.#begin(record, stash.sessionId, Math.max(stash.nextSeq, written));
  }

  /** 完整暂存：补写未落库的那段；最小暂存：在会话行的 `nextSeq` 上记一个 `gap` 标记。 */
  #stashEntries(stash: ReplayStash, sessionNextSeq: number): ReplayEventEntry[] {
    if (stash.gap !== true) return unwrittenStashEvents(stash, sessionNextSeq);
    const gap = createReplayMarkerEvent(REPLAY_MARKER_TAGS.gap, { reason: 'stash_unavailable' }, Date.now());
    return [{ seq: sessionNextSeq, event: gap }];
  }

  /** `pagehide` 写暂存，`pageshow(persisted)`（从 bfcache 回来，页面没真卸载）删暂存。 */
  #watchPage(storage: Storage): () => void {
    const onPageHide = (): void => {
      const recorder = this.#recorder;
      if (recorder === null) return;
      writeReplayStash(storage, this.#stashKey, {
        sessionId: recorder.sessionId,
        nextSeq: recorder.nextSeq,
        events: recorder.pending()
      });
    };
    const onPageShow = (event: Event): void => {
      if ((event as PageTransitionEvent).persisted) storage.removeItem(this.#stashKey);
    };
    const page = globalThis as Required<Pick<PageGlobal, 'addEventListener' | 'removeEventListener'>>;
    page.addEventListener('pagehide', onPageHide);
    page.addEventListener('pageshow', onPageShow);
    return () => {
      page.removeEventListener('pagehide', onPageHide);
      page.removeEventListener('pageshow', onPageShow);
    };
  }

  #unsubscribeCommits(): void {
    this.#commits?.unsubscribe();
    this.#commits = null;
  }

  #assertLive(): void {
    if (!this.#released) return;
    throw new RxDBReplayError('not_installed', 'the connection epoch that installed it was released');
  }
}
