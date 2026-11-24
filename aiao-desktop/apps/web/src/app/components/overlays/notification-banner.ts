import { Component, DestroyRef, effect, inject } from '@angular/core';

import { AppNotifications } from '../../services/app-notifications';
import { Icon } from '../../shared/icon';

/** 横幅自动消失的时长（毫秒）：5 秒，指针悬停期间暂停计时。 */
export const BANNER_AUTO_DISMISS_MS = 5_000;

/**
 * 通知横幅栈（[BANNER]）：顶部右侧堆叠的应用通知横幅，最新的在最上，每个 5 秒自动消失（指针悬停暂停），
 * 点横幅打开来源应用，× 只关横幅不碰通知中心里的条目。专注模式（勿扰）开启时新通知不再入队。
 * 组件常驻渲染（overlay-layer），selector 固定 `app-notification-banner-stack`；样式内联，不依赖全局样式表。
 */
@Component({
  selector: 'app-notification-banner-stack',
  imports: [Icon],
  host: {
    style:
      'position: fixed; top: calc(var(--mb-h) + 10px); right: 10px; z-index: 980; display: flex; flex-direction: column; gap: 10px; pointer-events: none;'
  },
  template: `
    @for (banner of notes.banners(); track banner.id) {
      <div
        class="nb"
        [attr.data-banner-id]="banner.id"
        data-nb-banner
        (pointerenter)="pause(banner.id)"
        (pointerleave)="resume(banner.id)"
      >
        <button
          class="nb-x"
          type="button"
          tabindex="0"
          [attr.aria-label]="'Dismiss notification from ' + banner.app.name"
          (click)="notes.dismissBanner(banner.id)"
        >
          ×
        </button>
        <button
          class="nb-main"
          type="button"
          tabindex="0"
          [attr.aria-label]="'Open ' + banner.app.name + ': ' + banner.title"
          (click)="notes.bannerOpen(banner.id)"
        >
          <svg class="nb-icon" [appIcon]="banner.app.icon"></svg>
          <span class="nb-txt">
            <span class="nb-app" data-nb-app>{{ banner.app.name }}</span>
            <b data-nb-title>{{ banner.title }}</b>
            <span class="nb-body" data-nb-body>{{ banner.body }}</span>
          </span>
        </button>
      </div>
    }
  `,
  styles: `
    .nb {
      pointer-events: auto;
      width: 344px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 10px 12px;
      border: 0.5px solid var(--glass-dock-edge);
      border-radius: 16px;
      background: color-mix(in srgb, var(--win-2) 92%, transparent);
      color: var(--txt);
      box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.35);
      -webkit-backdrop-filter: blur(30px) saturate(1.6);
      backdrop-filter: blur(30px) saturate(1.6);
      animation: nb-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes nb-in {
      from {
        opacity: 0;
        transform: translateX(28px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .nb-main {
      order: -1;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .nb-x {
      flex: none;
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--txt-2);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .nb-x:hover {
      background: var(--fill);
    }
    .nb-icon {
      width: 36px;
      height: 36px;
      flex: none;
    }
    .nb-txt {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .nb-app {
      font-size: 11px;
      font-weight: 600;
      color: var(--txt-2);
    }
    .nb-title {
      font-size: 12.5px;
      font-weight: 600;
    }
    .nb-body {
      font-size: 12px;
      color: var(--txt-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .nb-main:focus-visible,
    .nb-x:focus-visible {
      outline: 2px solid var(--blue);
      outline-offset: 1px;
    }
  `
})
export class NotificationBanner {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly paused = new Set<string>();
  protected readonly notes = inject(AppNotifications);

  constructor() {
    effect(() => {
      const banners = this.notes.banners();
      const shown = new Set(banners.map(banner => banner.id));
      for (const [id, timer] of this.timers) {
        if (shown.has(id)) continue;
        clearTimeout(timer);
        this.timers.delete(id);
        this.paused.delete(id);
      }
      for (const banner of banners) {
        if (!this.timers.has(banner.id) && !this.paused.has(banner.id)) this.arm(banner.id);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers.values()) clearTimeout(timer);
    });
  }

  /** 指针悬停：暂停自动消失的计时。 */
  protected pause(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.paused.add(id);
  }

  /** 指针离开：重新计时，满 {@link BANNER_AUTO_DISMISS_MS} 自动消失。 */
  protected resume(id: string): void {
    this.paused.delete(id);
    this.arm(id);
  }

  private arm(id: string): void {
    this.timers.set(id, setTimeout(() => this.notes.dismissBanner(id), BANNER_AUTO_DISMISS_MS));
  }
}
