import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';

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

/** 重启 / 关机确认面板的一次请求；面板由桌面壳渲染，结论经 {@link Session.resolveConfirm} 回来。 */
export interface SessionConfirm {
  readonly id: number;
  readonly mode: 'restart' | 'off';
}

/** 确认面板的正文（两模式共用）。 */
const CONFIRM_MESSAGE = 'Open windows and documents will be closed. You can cancel to keep working.';

/** 睡眠唤醒动画的时长（毫秒）：waking 阶段淡出遮罩。 */
const WAKE_MS = 900;

/**
 * 重启 / 关机确认面板的文案（纯函数，供单测与桌面壳复用）。
 */
export function confirmPrompt(mode: SessionConfirm['mode']): {
  readonly title: string;
  readonly message: string;
  readonly action: string;
} {
  return mode === 'restart' ?
      {
        title: 'Are you sure you want to restart your computer?',
        message: CONFIRM_MESSAGE,
        action: 'Restart'
      }
    : {
        title: 'Are you sure you want to shut down your computer?',
        message: CONFIRM_MESSAGE,
        action: 'Shut Down'
      };
}

/** 开机、锁屏、睡眠、重启与关机的会话状态；画面细节在开机屏和锁屏组件里。 */
@Service({ autoProvided: false })
export class Session {
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly overlays = inject(Overlays);
  private readonly document = inject(DOCUMENT);
  private readonly location = this.document.location;
  private readonly destroyRef = inject(DestroyRef);
  private seq = 0;
  private confirmSeq = 0;
  private stopping = false;
  /** 睡眠时挂着的唤醒监听：任一输入触发后成对移除，防止泄漏。 */
  private wakeListener: (() => void) | null = null;

  /** `?boot=0` 或 `#noboot` 跳过开机动画，测试脚本依赖这一点。 */
  readonly boot = signal<BootRun | null>(this.bootWanted() ? { id: 0, mode: 'startup' } : null);
  readonly locked = signal(false);
  readonly sleep = signal<SleepPhase>('awake');
  /** 重启 / 关机前等待确认的请求（macOS 的确认对话框）；没有请求时为 `null`。 */
  readonly confirm = signal<SessionConfirm | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => this.removeWakeListener());
  }

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

  /**
   * 重启先弹确认对话框：取消什么都不发生，确认后走 tearDown（关窗协商 → 开机 → 锁屏）。
   * 关机画面上的「点击启动」例外：没有窗口要协商，直接执行不弹确认。
   * `ask` 为 false 时跳过确认（磁盘工具抹掉后的重启是抹掉确认的后续，不再二次确认）。
   */
  restart(ask = true): void {
    if (ask) this.confirmTearDown('restart');
    else this.tearDown('restart');
  }

  /** 关机先弹确认对话框：取消什么都不发生，确认后走 tearDown（关窗协商 → 关机画面）。 */
  shutDown(): void {
    this.confirmTearDown('off');
  }

  /** 确认对话框的结论：确认（Restart / Shut Down）或取消（Cancel / Esc）。 */
  resolveConfirm(approved: boolean): void {
    const request = this.confirm();
    if (!request) return;
    this.confirm.set(null);
    if (approved) this.tearDown(request.mode);
  }

  /**
   * 登出（⇧⌘Q）：全部窗口关闭（含未保存内容的逐个协商）通过后回到锁屏。
   * 与重启不同：不拆会话、不重新开机，窗口清空、桌面层留在原地。
   */
  logOut(): void {
    if (this.stopping) return;
    const result = this.wm.closeAll();
    if (typeof result === 'boolean') {
      if (result) this.finishLogOut();
      return;
    }
    this.stopping = true;
    void result.then(approved => {
      this.stopping = false;
      if (approved) this.finishLogOut();
    });
  }

  /** 睡眠：睡下后等任意键盘输入或点击唤醒（waking 动画后回到 awake），不再自动定时醒来。 */
  sleepNow(): void {
    if (this.sleep() !== 'awake') return;
    this.popover.close();
    this.sleep.set('asleep');
    const wake = (): void => {
      this.removeWakeListener();
      this.sleep.set('waking');
      setTimeout(() => this.sleep.set('awake'), WAKE_MS);
    };
    this.wakeListener = wake;
    this.document.addEventListener('keydown', wake);
    this.document.addEventListener('pointerdown', wake);
  }

  private finishLogOut(): void {
    this.overlays.closeNotifications();
    this.lock();
  }

  private removeWakeListener(): void {
    const wake = this.wakeListener;
    if (!wake) return;
    this.document.removeEventListener('keydown', wake);
    this.document.removeEventListener('pointerdown', wake);
    this.wakeListener = null;
  }

  private confirmTearDown(mode: 'restart' | 'off'): void {
    if (this.stopping || this.confirm()) return;
    /* 关机画面上的「点击启动」直接执行：机器已经关了，没有窗口要协商，确认面板只会打断启动。 */
    if (this.boot()?.mode === 'off') {
      this.tearDown(mode);
      return;
    }
    this.confirm.set({ id: ++this.confirmSeq, mode });
  }

  private tearDown(mode: 'restart' | 'off'): void {
    if (this.stopping) return;
    const result = this.wm.closeAll();
    if (typeof result === 'boolean') this.finishTearDown(mode, result);
    else {
      this.stopping = true;
      void result.then(approved => {
        this.stopping = false;
        this.finishTearDown(mode, approved);
      });
    }
  }

  private finishTearDown(mode: 'restart' | 'off', approved: boolean): void {
    if (!approved) return;
    this.overlays.closeNotifications();
    this.popover.close(true);
    this.boot.set({ id: ++this.seq, mode });
  }

  private bootWanted(): boolean {
    return new URLSearchParams(this.location.search).get('boot') !== '0' && !/\bnoboot\b/.test(this.location.hash);
  }
}
