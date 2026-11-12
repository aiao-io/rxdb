import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

import { HOME_PATH } from './file-system';
import { Overlays } from './overlays';
import { PopoverService } from './popover';
import { WindowManager } from './window-manager';

/** 开机画面的一次运行：开机、重启，或关机后的「点击启动」。 */
export interface BootRun {
  readonly id: number;
  readonly mode: 'startup' | 'restart' | 'off';
}

export type SleepPhase = 'awake' | 'asleep' | 'waking';

/** 开机、锁屏、睡眠、重启与关机的会话状态；画面细节在开机屏和锁屏组件里。 */
@Service({ autoProvided: false })
export class Session {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly overlays = inject(Overlays);
  private readonly location = inject(DOCUMENT).location;
  private seq = 0;

  /** `?boot=0` 或 `#noboot` 跳过开机动画，测试脚本依赖这一点。 */
  readonly boot = signal<BootRun | null>(this.bootWanted() ? { id: 0, mode: 'startup' } : null);
  readonly locked = signal(false);
  readonly sleep = signal<SleepPhase>('awake');

  /** 开机进度走完：进入锁屏；重启的会话随后打开 Finder。 */
  bootFinished(run: BootRun): void {
    this.lock();
    if (run.mode === 'restart') setTimeout(() => this.wm.open('finder', { path: HOME_PATH }), 900);
  }

  /** 开机画面淡出完毕后移除。 */
  bootDismissed(run: BootRun): void {
    if (this.boot() === run) this.boot.set(null);
  }

  lock(): void {
    this.popover.close(true);
    this.locked.set(true);
  }

  unlock(): void {
    this.locked.set(false);
  }

  /** 重启真的会拆掉会话：关掉所有窗口，重新走一遍开机进度，回到登录界面。 */
  restart(): void {
    this.tearDown();
    this.boot.set({ id: ++this.seq, mode: 'restart' });
  }

  shutDown(): void {
    this.tearDown();
    this.boot.set({ id: ++this.seq, mode: 'off' });
  }

  sleepNow(): void {
    this.popover.close();
    this.sleep.set('asleep');
    setTimeout(() => {
      this.sleep.set('waking');
      setTimeout(() => this.sleep.set('awake'), 900);
    }, 1000);
  }

  private tearDown(): void {
    this.wm.closeAll();
    this.overlays.closeNotifications();
    this.popover.close(true);
  }

  private bootWanted(): boolean {
    return new URLSearchParams(this.location.search).get('boot') !== '0' && !/\bnoboot\b/.test(this.location.hash);
  }
}
