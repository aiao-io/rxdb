import type { ReplayManager, ReplaySessionInfo, ReplayState, ReplayUsage } from '@aiao/rxdb-plugin-replay';
import { ReplayerComponent } from '@aiao/rxdb-plugin-replay-angular';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { isReplayEnabled, setReplayEnabled } from '../../rxdb/replay-toggle';

type PagePhase = 'disabled' | 'loading' | 'ready' | 'error';

/**
 * 录制回放演示页（US-909 阶段 C，research D11）。
 *
 * @remarks
 * 开关写 `localStorage` 后整页重载：录制插件只在加载时按开关装上（见 `rxdb/replay-toggle`）。开关打开时本页同样经
 * `import()` 拿录制模块，等 `replayDemoReady` 兑现后显示录制状态、会话列表（状态 / 事件数 / 体积）、删除与 `<ao-replayer>`。
 * `data-phase`：`disabled` / `loading` / `ready` / `error`；回放组件自己的四态见 contracts/replayer-component.md §2。
 */
@Component({
  selector: 'app-replay-page',
  imports: [DatePipe, DecimalPipe, ReplayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './replay.page.html'
})
export default class ReplayPage {
  readonly #destroyRef = inject(DestroyRef);

  readonly $enabled = signal(isReplayEnabled(window.localStorage));
  readonly $replay = signal<ReplayManager | null>(null);
  readonly $recordingDbName = signal<string | null>(null);
  readonly $state = signal<ReplayState>({ kind: 'idle' });
  readonly $sessions = signal<ReplaySessionInfo[]>([]);
  readonly $usage = signal<ReplayUsage | null>(null);
  readonly $selectedId = signal<string | null>(null);
  readonly $error = signal<string | null>(null);
  readonly $busy = signal(false);

  readonly $phase = computed<PagePhase>(() => {
    if (!this.$enabled()) return 'disabled';
    if (this.$error() !== null && this.$replay() === null) return 'error';
    return this.$replay() === null ? 'loading' : 'ready';
  });
  readonly $recording = computed(() => this.$state().kind === 'recording');

  constructor() {
    if (this.$enabled()) void this.#load();
  }

  toggle(): void {
    setReplayEnabled(window.localStorage, !this.$enabled());
    window.location.reload();
  }

  async start(): Promise<void> {
    // 不自动选中新会话：边录边回放会把回放视图自己录进去
    await this.#run(async replay => {
      await replay.start();
    });
  }

  async stop(): Promise<void> {
    await this.#run(replay => replay.stop());
  }

  async remove(session: ReplaySessionInfo): Promise<void> {
    await this.#run(async replay => {
      await replay.deleteSession(session.id);
      if (this.$selectedId() === session.id) this.$selectedId.set(null);
    });
  }

  select(session: ReplaySessionInfo): void {
    this.$selectedId.set(session.id);
  }

  async refresh(): Promise<void> {
    await this.#run(async () => undefined);
  }

  async #load(): Promise<void> {
    try {
      const { replayDemoReady } = await import('../../rxdb/replay-recording');
      const api = await replayDemoReady;
      const subscription = api.replay.state$.subscribe(state => this.$state.set(state));
      this.#destroyRef.onDestroy(() => subscription.unsubscribe());
      this.$recordingDbName.set(api.recordingDbName);
      this.$replay.set(api.replay);
      await this.refresh();
    } catch (error) {
      this.$error.set(error instanceof Error ? error.message : String(error));
    }
  }

  /** 执行一个操作后刷新会话列表与用量；出错时显示消息，列表照常刷新。 */
  async #run(action: (replay: ReplayManager) => Promise<void>): Promise<void> {
    const replay = this.$replay();
    if (!replay) return;
    this.$busy.set(true);
    this.$error.set(null);
    try {
      await action(replay);
    } catch (error) {
      this.$error.set(error instanceof Error ? error.message : String(error));
    }
    try {
      const [sessions, usage] = await Promise.all([replay.listSessions(), replay.usage()]);
      this.$sessions.set(sessions);
      this.$usage.set(usage);
    } finally {
      this.$busy.set(false);
    }
  }
}
