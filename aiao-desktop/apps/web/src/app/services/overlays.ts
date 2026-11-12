import { Service, WritableSignal, inject, signal } from '@angular/core';

import { PopoverService } from './popover';

/** 浮层的三个阶段：关闭动画期间节点仍在，因此不能立即再次打开。 */
export type OverlayPhase = 'closed' | 'open' | 'closing';

const CLOSE_MS = { launchpad: 200, spotlight: 150 } as const;

/** 启动台、聚焦搜索与通知中心的开关状态。 */
@Service({ autoProvided: false })
export class Overlays {
  private readonly popover = inject(PopoverService);

  readonly launchpad = signal<OverlayPhase>('closed');
  readonly spotlight = signal<OverlayPhase>('closed');
  /** 通知中心的关闭动画由组件自己播放，播完再回到 `closed`。 */
  readonly notifications = signal<OverlayPhase>('closed');

  openLaunchpad(): void {
    this.openPhase(this.launchpad);
  }

  closeLaunchpad(): void {
    this.closePhase(this.launchpad, CLOSE_MS.launchpad);
  }

  toggleLaunchpad(): void {
    if (this.launchpad() === 'closed') this.openLaunchpad();
    else this.closeLaunchpad();
  }

  openSpotlight(): void {
    this.openPhase(this.spotlight);
  }

  closeSpotlight(): void {
    this.closePhase(this.spotlight, CLOSE_MS.spotlight);
  }

  toggleSpotlight(): void {
    if (this.spotlight() === 'closed') this.openSpotlight();
    else this.closeSpotlight();
  }

  /** 关闭途中也能重新打开：组件会中止淡出、重新滑入。 */
  openNotifications(): void {
    if (this.notifications() === 'open') return;
    this.popover.close(true);
    this.notifications.set('open');
  }

  closeNotifications(): void {
    if (this.notifications() === 'open') this.notifications.set('closing');
  }

  toggleNotifications(): void {
    if (this.notifications() === 'open') this.closeNotifications();
    else this.openNotifications();
  }

  private openPhase(phase: WritableSignal<OverlayPhase>): void {
    if (phase() !== 'closed') return;
    this.popover.close(true);
    phase.set('open');
  }

  private closePhase(phase: WritableSignal<OverlayPhase>, ms: number): void {
    if (phase() !== 'open') return;
    phase.set('closing');
    setTimeout(() => phase.set('closed'), ms);
  }
}
