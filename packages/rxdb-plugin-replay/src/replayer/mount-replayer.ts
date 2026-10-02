import type { WorkingTreeRestoreResult } from '@aiao/rxdb-plugin-working-tree';
import type { eventWithTime } from '@rrweb/types';
import type { Replayer } from 'rrweb';
import { replayRestoreHint } from '../restore.js';
import type { ReplayCommitMarker, ReplayManager } from '../types.js';
import { REPLAYER_STYLE } from './style.js';

/** rrweb `EventType.FullSnapshot`：没有它就没有可重建的 DOM。 */
const FULL_SNAPSHOT = 2;

/** 回放器的输入（`specs/005-us-909-session-replay/contracts/replayer-component.md` §1）。 */
export interface ReplayerOptions {
  /** 读事件、读标记、恢复到 commit 的来源，通常是 `rxdb.replay`。 */
  readonly replay: ReplayManager;
  /** 要回放的会话。 */
  readonly sessionId: string;
  /** 就绪后落在的时刻：相对会话起点的 ms，默认 0。 */
  readonly initialTime?: number;
  /** 时刻变化（跳转、播放中逐帧、播完）。 */
  readonly onTimeChange?: (timeMs: number) => void;
  /** 点 commit 标记恢复之后的结果。 */
  readonly onCommitRestore?: (event: ReplayerCommitRestoreEvent) => void;
}

/** 点 commit 标记恢复的结果；`restoreToCommit()` 抛错时 `reason` 为 `'error'`。 */
export interface ReplayerCommitRestoreEvent {
  readonly marker: ReplayCommitMarker;
  readonly result: WorkingTreeRestoreResult | { readonly ok: false; readonly reason: 'error'; readonly error: Error };
}

/** {@link mountReplayer} 返回的句柄。非就绪态 `play` / `pause` / `seek` 是空操作，`destroy()` 之后一切都是空操作。 */
export interface ReplayerHandle {
  /** 换 `replay` 或 `sessionId` 重新加载；只改 `initialTime` 等价于 `seek()`。 */
  update(options: Partial<Pick<ReplayerOptions, 'replay' | 'sessionId' | 'initialTime'>>): void;
  /** 从当前时刻播放；已在末尾则从头播。 */
  play(): void;
  /** 停在当前时刻。 */
  pause(): void;
  /** 跳到相对会话起点 `timeMs` 处（超出范围按边界算）；加载中调用则加载完成后落在最后一次的时刻。 */
  seek(timeMs: number): void;
  /** 停播、销毁 rrweb 回放、清空宿主元素。幂等。 */
  destroy(): void;
}

/** `ms` → `mm:ss`。 */
const mmss = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  attributes: Readonly<Record<string, string>> = {}
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

/** 可回放（至少两条事件且有全量快照）时给出首个全量快照，否则 `undefined`。 */
const firstSnapshot = (events: readonly eventWithTime[]): eventWithTime | undefined =>
  events.length >= 2 ? events.find(event => event.type === FULL_SNAPSHOT) : undefined;

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/** 就绪态里要随播放更新的控件。 */
interface ReadyView {
  readonly replayer: Replayer;
  readonly total: number;
  readonly startTime: number;
  /** 首个全量快照相对起点的时刻。 */
  readonly snapshotOffset: number;
  readonly toggle: HTMLButtonElement;
  readonly timeline: HTMLInputElement;
  readonly status: HTMLElement;
}

/**
 * 「落在 `time`」换成交给 rrweb 的偏移。
 *
 * @remarks
 * rrweb 只同步应用时间戳严格早于偏移的事件：多走 1 ms，`time` 时刻的事件才算进去（落在末尾能看到最后一条）；
 * 首个全量快照之前没有 DOM 可看，以它为下界，往回跳到开头时才会重建，而不是停在跳之前的样子。
 */
const rrwebOffset = (view: ReadyView, time: number): number => Math.max(time, view.snapshotOffset) + 1;

class ReplayerView implements ReplayerHandle {
  readonly #host: HTMLElement;
  readonly #root = element('div', { className: 'rxdb-replayer' });
  readonly #style = element('style', { textContent: REPLAYER_STYLE });
  #options: ReplayerOptions;
  /** 每次加载 / 销毁加一：晚到的旧加载与旧恢复结果对不上就丢弃。 */
  #generation = 0;
  #view: ReadyView | null = null;
  #playing = false;
  #frame: number | null = null;
  #position = 0;
  #destroyed = false;

  constructor(host: HTMLElement, options: ReplayerOptions) {
    this.#host = host;
    this.#options = options;
    this.#position = options.initialTime ?? 0;
    host.replaceChildren(this.#root);
    this.#load();
  }

  update(options: Partial<Pick<ReplayerOptions, 'replay' | 'sessionId' | 'initialTime'>>): void {
    if (this.#destroyed) return;
    const previous = this.#options;
    this.#options = { ...previous, ...options };
    const reload =
      (options.replay !== undefined && options.replay !== previous.replay) ||
      (options.sessionId !== undefined && options.sessionId !== previous.sessionId);
    if (reload) {
      this.#position = this.#options.initialTime ?? 0;
      this.#load();
      return;
    }
    if (options.initialTime !== undefined) this.seek(options.initialTime);
  }

  play(): void {
    const view = this.#view;
    if (view === null || this.#playing) return;
    if (this.#position >= view.total) this.#position = 0;
    this.#playing = true;
    view.replayer.play(rrwebOffset(view, this.#position));
    this.#renderToggle(view);
    this.#tick();
  }

  pause(): void {
    const view = this.#view;
    if (view === null || !this.#playing) return;
    this.#stopTicking();
    this.#playing = false;
    view.replayer.pause();
    this.#setPosition(view, view.replayer.getCurrentTime());
    this.#renderToggle(view);
  }

  seek(timeMs: number): void {
    if (this.#destroyed) return;
    const view = this.#view;
    if (view === null) {
      this.#position = timeMs;
      return;
    }
    const time = Math.min(Math.max(timeMs, 0), view.total);
    if (this.#playing) view.replayer.play(rrwebOffset(view, time));
    else view.replayer.pause(rrwebOffset(view, time));
    this.#setPosition(view, time);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#teardown();
    this.#host.replaceChildren();
  }

  /** 停播、销毁旧 `Replayer`，让在途的加载与恢复作废。 */
  #teardown(): void {
    this.#generation++;
    this.#stopTicking();
    this.#playing = false;
    this.#view?.replayer.destroy();
    this.#view = null;
  }

  #load(): void {
    this.#teardown();
    const generation = this.#generation;
    const { replay, sessionId } = this.#options;
    this.#render('loading');
    Promise.all([replay.readEvents(sessionId), replay.listCommitMarkers(sessionId), import('rrweb')]).then(
      ([events, markers, rrweb]) => {
        if (generation !== this.#generation) return;
        const snapshot = firstSnapshot(events);
        if (snapshot === undefined) {
          this.#render(
            'empty',
            element('p', { className: 'rxdb-replayer__empty', textContent: 'No events to replay' })
          );
          return;
        }
        this.#mount(events, snapshot, markers, rrweb.Replayer);
      },
      (error: unknown) => {
        if (generation !== this.#generation) return;
        this.#renderError(toError(error));
      }
    );
  }

  #mount(
    events: eventWithTime[],
    snapshot: eventWithTime,
    markers: readonly ReplayCommitMarker[],
    ReplayerClass: typeof Replayer
  ): void {
    const stage = element('div', { className: 'rxdb-replayer__stage' });
    const toggle = element('button', { type: 'button', className: 'rxdb-replayer__toggle' });
    const timeline = element('input', { type: 'range', className: 'rxdb-replayer__timeline', min: '0' });
    timeline.setAttribute('aria-label', 'Timeline');
    const status = element('div', { className: 'rxdb-replayer__status' }, { role: 'status', 'aria-live': 'polite' });
    const controls = element('div', { className: 'rxdb-replayer__controls' });
    controls.append(toggle, timeline);
    this.#render('ready', stage, controls, status);

    let replayer: Replayer;
    try {
      replayer = new ReplayerClass(events, { root: stage, mouseTail: false, showWarning: false });
    } catch (error) {
      this.#renderError(toError(error));
      return;
    }
    const { startTime, totalTime } = replayer.getMetaData();
    const snapshotOffset = snapshot.timestamp - startTime;
    const view: ReadyView = { replayer, total: totalTime, startTime, snapshotOffset, toggle, timeline, status };
    this.#view = view;
    timeline.max = String(totalTime);
    toggle.addEventListener('click', () => (this.#playing ? this.pause() : this.play()));
    timeline.addEventListener('input', () => this.seek(Number(timeline.value)));
    replayer.on('finish', () => this.#finish(view));
    if (markers.length > 0) status.before(this.#renderMarkers(view, markers));
    this.#renderToggle(view);
    this.seek(this.#position);
  }

  #renderMarkers(view: ReadyView, markers: readonly ReplayCommitMarker[]): HTMLUListElement {
    const list = element('ul', { className: 'rxdb-replayer__commits' }, { 'aria-label': 'Commits' });
    for (const marker of markers) {
      const offset = marker.timestamp - view.startTime;
      const button = element('button', {
        type: 'button',
        textContent: `${marker.commitId.slice(0, 8)} · ${mmss(offset)}`
      });
      button.dataset['commitId'] = marker.commitId;
      button.addEventListener('click', () => this.#restore(view, marker, offset));
      const item = element('li');
      item.append(button);
      list.append(item);
    }
    return list;
  }

  async #restore(view: ReadyView, marker: ReplayCommitMarker, offset: number): Promise<void> {
    const generation = this.#generation;
    this.pause();
    this.seek(offset);
    view.status.textContent = 'Restoring…';
    let result: ReplayerCommitRestoreEvent['result'];
    try {
      result = await this.#options.replay.restoreToCommit(marker.commitId);
    } catch (error) {
      result = { ok: false, reason: 'error', error: toError(error) };
    }
    if (generation !== this.#generation) return;
    view.status.textContent = this.#describe(result);
    this.#options.onCommitRestore?.({ marker, result });
  }

  #describe(result: ReplayerCommitRestoreEvent['result']): string {
    if (result.ok) return `Restored ${result.restoredCount} changes`;
    return result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason);
  }

  #finish(view: ReadyView): void {
    this.#stopTicking();
    this.#playing = false;
    this.#setPosition(view, view.total);
    this.#renderToggle(view);
  }

  #tick(): void {
    const view = this.#view;
    if (view === null || !this.#playing) return;
    const time = Math.min(view.replayer.getCurrentTime(), view.total);
    if (time !== this.#position) this.#setPosition(view, time);
    this.#frame = requestAnimationFrame(() => this.#tick());
  }

  #stopTicking(): void {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  #setPosition(view: ReadyView, time: number): void {
    this.#position = time;
    view.timeline.value = String(time);
    view.timeline.setAttribute('aria-valuetext', mmss(time));
    this.#options.onTimeChange?.(time);
  }

  #renderToggle(view: ReadyView): void {
    view.toggle.textContent = this.#playing ? 'Pause' : 'Play';
    view.toggle.setAttribute('aria-pressed', String(this.#playing));
  }

  #renderError(error: Error): void {
    this.#teardown();
    this.#render(
      'error',
      element('div', { className: 'rxdb-replayer__error', textContent: error.message }, { role: 'alert' })
    );
  }

  #render(state: 'loading' | 'empty' | 'error' | 'ready', ...nodes: Node[]): void {
    this.#root.dataset['state'] = state;
    if (state === 'loading') this.#root.setAttribute('aria-busy', 'true');
    else this.#root.removeAttribute('aria-busy');
    this.#root.replaceChildren(this.#style, ...nodes);
  }
}

/**
 * 在 `host` 里渲染一个会话的回放器：rrweb 回放、播放 / 暂停、时间轴、commit 标记（点了恢复工作树）与恢复结果。
 *
 * @remarks
 * DOM 与四态（`loading` / `empty` / `error` / `ready`）见 `specs/005-us-909-session-replay/contracts/replayer-component.md` §2；
 * 三个框架的 `Replayer` 组件都只是把宿主元素交给它。`rrweb` 在加载时才动态导入。
 *
 * @param host - 回放器挂载的元素，原有子节点会被替换
 * @param options - 会话来源与回调
 * @returns 命令句柄；卸载时调 `destroy()`
 *
 * @example
 * ```ts
 * const handle = mountReplayer(element, { replay: rxdb.replay, sessionId });
 * handle.seek(5_000);
 * handle.destroy();
 * ```
 */
export const mountReplayer = (host: HTMLElement, options: ReplayerOptions): ReplayerHandle => {
  const view = new ReplayerView(host, options);
  return {
    update: next => view.update(next),
    play: () => view.play(),
    pause: () => view.pause(),
    seek: timeMs => view.seek(timeMs),
    destroy: () => view.destroy()
  };
};
