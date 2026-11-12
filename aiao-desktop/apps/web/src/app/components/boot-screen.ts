import { Component, DestroyRef, ViewEncapsulation, effect, inject, signal, untracked } from '@angular/core';

import { BootRun, Session } from '../services/session';

/** 进度条分段推进：匀速的条像加载动画，Apple 的会停顿、跳跃再走完。 */
const STEPS: Readonly<Record<'startup' | 'restart', readonly (readonly [number, number])[]>> = {
  startup: [
    [120, 14],
    [420, 27],
    [700, 34],
    [980, 62],
    [1180, 74],
    [1400, 88],
    [1620, 100]
  ],
  restart: [
    [80, 18],
    [360, 30],
    [640, 48],
    [900, 70],
    [1120, 86],
    [1340, 100]
  ]
};
const DONE_AT = { startup: 1980, restart: 1700 } as const;

/** 开机画面：开机与重启的进度条，或关机后的「点击启动」。 */
@Component({
  selector: 'app-boot-screen',
  templateUrl: './boot-screen.html',
  styleUrl: './boot-screen.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(document:keydown)': 'keySkip()'
  }
})
export class BootScreen {
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** 开机阶段的第一次按键允许跳过，之后不再响应。 */
  private keyArmed = false;
  protected readonly session = inject(Session);
  protected readonly progress = signal<number | null>(null);
  protected readonly leaving = signal(false);

  constructor() {
    effect(() => {
      const run = this.session.boot();
      untracked(() => this.start(run));
    });
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  /** 不耐烦是允许的：点一下或按任意键直接走完。 */
  protected skip(run: BootRun): void {
    if (run.mode !== 'startup') return;
    this.clear();
    this.progress.set(100);
    this.finish(run);
  }

  protected keySkip(): void {
    if (!this.keyArmed) return;
    this.keyArmed = false;
    const run = this.session.boot();
    if (run) this.skip(run);
  }

  private start(run: BootRun | null): void {
    this.clear();
    this.progress.set(null);
    this.leaving.set(false);
    this.keyArmed = run?.mode === 'startup';
    if (!run || run.mode === 'off') return;
    this.timers = STEPS[run.mode].map(([at, pct]) => setTimeout(() => this.progress.set(pct), at));
    this.timers.push(setTimeout(() => this.finish(run), DONE_AT[run.mode]));
  }

  private finish(run: BootRun): void {
    if (this.session.boot() !== run) return;
    this.leaving.set(true);
    this.session.bootFinished(run);
    setTimeout(() => this.session.bootDismissed(run), 480);
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
