import {
  mountReplayer,
  type ReplayerCommitRestoreEvent,
  type ReplayerHandle,
  type ReplayerOptions
} from '@aiao/rxdb-plugin-replay';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

type ReplayerInputs = Pick<ReplayerOptions, 'replay' | 'sessionId' | 'initialTime'>;

/** 只挑出变化了的输入；都没变返回 `undefined`。 */
const changedInputs = (previous: ReplayerInputs, next: ReplayerInputs): Partial<ReplayerInputs> | undefined => {
  const changes: { -readonly [K in keyof ReplayerInputs]?: ReplayerInputs[K] } = {};
  if (next.replay !== previous.replay) changes.replay = next.replay;
  if (next.sessionId !== previous.sessionId) changes.sessionId = next.sessionId;
  if (next.initialTime !== previous.initialTime) changes.initialTime = next.initialTime;
  return Object.keys(changes).length > 0 ? changes : undefined;
};

/**
 * 会话回放组件：在组件内的一个 `div` 上挂核心的 `mountReplayer`，输入变化走 `update()`，销毁时 `destroy()`。
 *
 * @remarks
 * 与 React / Vue 的 `Replayer` 同一组输入 / 输出 / 命令（contracts/replayer-component.md §3），由 parity 用例保证。
 * 只在浏览器渲染后挂载（`afterNextRender`），SSR 下不碰 DOM；`rrweb` 在核心视图里按需 `import()`，挂载之前不进包。
 *
 * @example
 * ```html
 * <ao-replayer #replayer [replay]="rxdb.replay" [sessionId]="sessionId" (aoCommitRestore)="onRestore($event)" />
 * <button (click)="replayer.play()">播放</button>
 * ```
 */
@Component({
  selector: 'ao-replayer',
  template: '<div #host></div>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReplayerComponent {
  readonly #mounted = signal(false);
  #handle: ReplayerHandle | undefined;
  #applied: ReplayerInputs | undefined;
  // viewChild 不能用在 ES 私有字段上
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  /** 录制门面（`rxdb.replay`）。换实例会重新加载。 */
  readonly replay = input.required<ReplayerOptions['replay']>();
  /** 要回放的会话。换会话会重新加载，不重建组件。 */
  readonly sessionId = input.required<string>();
  /** 加载完成后落到的时刻（相对会话起点的 ms，默认 0）；之后再改等价于 `seek()`。 */
  readonly initialTime = input<number>();

  /** 播放 / 跳转导致回放时刻变化（ms）。 */
  readonly aoTimeChange = output<number>();
  /** 点 commit 标记后的恢复结果（成功、四种拒绝或抛错）。 */
  readonly aoCommitRestore = output<ReplayerCommitRestoreEvent>();

  constructor() {
    afterNextRender(() => {
      this.#applied = this.#readInputs();
      this.#handle = mountReplayer(this.host().nativeElement, {
        ...this.#applied,
        onTimeChange: timeMs => this.aoTimeChange.emit(timeMs),
        onCommitRestore: event => this.aoCommitRestore.emit(event)
      });
      this.#mounted.set(true);
    });

    effect(() => {
      // 挂载前不读输入（必填输入可能尚未赋值）；挂载后这一轮登记依赖，之后的变化才会再触发
      if (!this.#mounted()) return;
      const next = this.#readInputs();
      if (!this.#handle || !this.#applied) return;
      const changes = changedInputs(this.#applied, next);
      if (!changes) return;
      this.#applied = next;
      this.#handle.update(changes);
    });

    inject(DestroyRef).onDestroy(() => {
      this.#handle?.destroy();
      this.#handle = undefined;
      this.#mounted.set(false);
      this.#applied = undefined;
    });
  }

  /** 播放；加载完成前调用是空操作。 */
  play(): void {
    this.#handle?.play();
  }

  /** 暂停；加载完成前调用是空操作。 */
  pause(): void {
    this.#handle?.pause();
  }

  /** 跳到相对会话起点的 `timeMs`；加载完成前调用会记下目标时刻。 */
  seek(timeMs: number): void {
    this.#handle?.seek(timeMs);
  }

  #readInputs(): ReplayerInputs {
    return { replay: this.replay(), sessionId: this.sessionId(), initialTime: this.initialTime() };
  }
}
