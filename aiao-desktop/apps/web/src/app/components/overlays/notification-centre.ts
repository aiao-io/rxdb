import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, ElementRef, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';

import { AppLauncher } from '../../services/app-launcher';
import { AppNotification, AppNotifications } from '../../services/app-notifications';
import type { DesktopAppId } from '../../services/desktop-apps';
import { Overlays } from '../../services/overlays';
import { time12Plain } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { BatterySquareWidget, ClockSquareWidget, RemindersWidget } from '../widgets/notification-widgets';
import { CalendarWidget, StocksWidget, WeatherWidget } from '../widgets/widgets';
import { groupNotifications, swipedPast } from './notification-centre-model';

/** 一条滑动中的手势：起点、是否越过清除阈值。 */
interface Swipe {
  readonly id: string;
  readonly startX: number;
  passed: boolean;
}

/**
 * 通知中心：小组件、应用经 `notification` 能力提交的通知（ADESK-US-206 阶段 D）。条目按来源应用分组，
 * 组头是应用名与图标；点条目打开来源应用并收起面板，× 清除单条、Clear All 清除全部，键盘同样可达；
 * 专注模式（勿扰）开启时标题旁显示「专注模式开启」。条目向右滑过阈值清除（手势只动条目自己的 transform，
 * 面板的滑入滑出用 WAAPI 且不留 transform，否则面板的背景模糊会失效）。
 */
@Component({
  selector: 'app-notification-centre',
  imports: [Icon, ClockSquareWidget, BatterySquareWidget, WeatherWidget, CalendarWidget, StocksWidget, RemindersWidget],
  styleUrl: './notification-centre.scss',
  styles: `
    .nc-ttl {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nc-dnd {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--txt-2);
    }
    .nc-dnd svg {
      width: 12px;
      height: 12px;
    }
    .nc-groups {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .nc-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nc-ghead {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 4px;
    }
    .nc-gicon {
      width: 16px;
      height: 16px;
      flex: none;
    }
    .nc-gicon svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .nc-gname {
      font-size: 11px;
      font-weight: 600;
      color: var(--txt-2);
    }
    .note-main {
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
    .note-main:focus-visible {
      outline: 2px solid var(--blue);
      outline-offset: 1px;
    }
    /* 正文在按钮里不能是 <p>（按钮的内容模型是短语内容），这里复刻全局 .note .bd p 的样子。 */
    .note .bd .bd-p {
      display: block;
      margin: 1px 0 0;
      font-size: 12px;
      color: var(--txt-2);
      line-height: 1.3;
    }
  `,
  host: { style: 'display: contents' },
  template: `
    @if (overlays.notifications() === 'open') {
      <div id="nc-scrim" (pointerdown)="overlays.closeNotifications()"></div>
    }
    <div class="nosel" id="nc" #panel style="transform: translateX(100%)">
      <div class="nc-scroll">
        <div class="nc-row"><app-clock-square-widget /><app-battery-square-widget /></div>
        <app-weather-widget />
        <app-calendar-widget />
        <app-stocks-widget />
        <app-reminders-widget />
        @if (appNotes.entries().length > 0) {
          <div class="nc-head">
            <div class="nc-ttl">
              <div class="nc-title" id="nc-apps-title">{{ i18n.t('shell.notificationCentre.notifications') }}</div>
              @if (appNotes.focusMode()) {
                <span class="nc-dnd" data-nc-dnd role="status"
                  ><svg appIcon="g-moon"></svg>{{ i18n.t('shell.notificationCentre.focusOn') }}</span
                >
              }
            </div>
            <button class="nc-clear" (click)="appNotes.clearAll()" data-nc-clear-all tabindex="0" type="button">
              {{ i18n.t('shell.notificationCentre.clearAll') }}
            </button>
          </div>
          <div class="nc-groups" data-nc-groups>
            @for (group of groups(); track group.app.id) {
              <section
                class="nc-group"
                [attr.aria-label]="i18n.t('shell.notificationCentre.fromApp', { app: group.app.name })"
                [attr.data-app]="group.app.id"
                data-nc-group
              >
                <div class="nc-ghead">
                  <span class="nc-gicon"><svg [appIcon]="group.app.icon"></svg></span>
                  <span class="nc-gname" data-nc-group-name>{{ group.app.name }}</span>
                </div>
                <ul class="nc-apps">
                  @for (note of group.notes; track note.id) {
                    <li
                      class="note"
                      [attr.data-app]="note.app.id"
                      [attr.data-dedupe]="note.dedupeKey"
                      [attr.data-note-id]="note.id"
                      (pointercancel)="dragEnd(note, $event)"
                      (pointerdown)="dragStart(note, $event)"
                      (pointermove)="dragMove(note, $event)"
                      (pointerup)="dragEnd(note, $event)"
                      data-nc-note
                      style="touch-action: pan-y"
                    >
                      <button
                        class="x"
                        [attr.aria-label]="
                          i18n.t('shell.notificationCentre.clearNote', { app: note.app.name, title: note.title })
                        "
                        (click)="appNotes.clear(note.id)"
                        data-nc-clear
                        tabindex="0"
                        type="button"
                      >
                        ×
                      </button>
                      <button
                        class="note-main"
                        [attr.aria-label]="
                          i18n.t('shell.notificationCentre.openNote', { app: note.app.name, title: note.title })
                        "
                        (click)="openApp(note)"
                        tabindex="0"
                        type="button"
                      >
                        <span class="art"><svg [appIcon]="note.app.icon"></svg></span>
                        <span class="bd">
                          <span class="from" data-nc-app>{{ note.app.name }}</span>
                          <b data-nc-title>{{ note.title }}</b>
                          <span class="bd-p" data-nc-body>{{ note.body }}</span>
                        </span>
                        @if (note.image) {
                          <img class="pic" [src]="note.image" alt="" data-nc-image />
                        } @else if (note.symbol) {
                          <svg class="pic" [appIcon]="note.symbol"></svg>
                        }
                        <span class="tm" data-nc-time>{{ time(note) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class NotificationCentre {
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private animation: Animation | null = null;
  private drag: Swipe | null = null;
  /** 刚结束一次越过阈值的滑动：随后同一个指针动作尾声的 click 不算点击打开。 */
  private suppressClick = false;
  protected readonly overlays = inject(Overlays);
  protected readonly i18n = useI18n();
  protected readonly appNotes = inject(AppNotifications);
  protected readonly launcher = inject(AppLauncher);
  protected readonly groups = computed(() => groupNotifications(this.appNotes.entries()));

  constructor() {
    /* 首帧停在屏幕外：五个小组件的布局和模糊预热先付掉，下一帧再滑入才不掉帧。 */
    afterNextRender(() =>
      requestAnimationFrame(() => {
        if (this.overlays.notifications() !== 'open') return;
        this.panel().nativeElement.style.transform = '';
        this.slide('in');
      })
    );
    let closing = false;
    effect(() => {
      const phase = this.overlays.notifications();
      if (phase === 'closing') this.slide('out');
      else if (phase === 'open' && closing) this.slide('in');
      closing = phase === 'closing';
    });
  }

  protected time(note: AppNotification): string {
    return time12Plain(note.postedAt);
  }

  /** 点条目：打开来源应用并收起通知中心（滑动结束的 click 不算）。 */
  protected openApp(note: AppNotification): void {
    if (this.suppressClick) return;
    this.launcher.activate(note.app.id as DesktopAppId);
    this.overlays.closeNotifications();
  }

  /** 按下开始跟踪滑动；清除按钮上的按下不参与。 */
  protected dragStart(note: AppNotification, event: PointerEvent): void {
    if ((event.target as Element).closest('.x')) return;
    this.drag = { id: note.id, startX: event.clientX, passed: false };
  }

  /** 向右拖动：越过阈值后接管指针并跟随位移，方向不向下的拖动不管。 */
  protected dragMove(note: AppNotification, event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== note.id) return;
    const distance = event.clientX - drag.startX;
    if (distance <= 0) return;
    if (!drag.passed && swipedPast(distance)) {
      drag.passed = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      event.preventDefault();
    }
    if (drag.passed) (event.currentTarget as HTMLElement).style.transform = `translateX(${Math.min(distance, 200)}px)`;
  }

  /** 松手：越过阈值就清除条目；差一点就滑回原位。 */
  protected dragEnd(note: AppNotification, event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== note.id) return;
    this.drag = null;
    if (!drag.passed) return;
    this.suppressClick = true;
    setTimeout(() => {
      this.suppressClick = false;
    }, 0);
    const row = event.currentTarget as HTMLElement;
    const distance = event.type === 'pointercancel' ? 0 : event.clientX - drag.startX;
    if (swipedPast(distance)) {
      this.appNotes.clear(note.id);
      return;
    }
    row.animate([{ transform: row.style.transform }, { transform: 'none' }], {
      duration: 160,
      easing: 'ease-out'
    }).onfinish = () => {
      row.style.transform = '';
    };
  }

  private slide(direction: 'in' | 'out'): void {
    this.animation?.cancel();
    const panel = this.panel().nativeElement;
    if (direction === 'in') {
      this.animation = panel.animate(
        [
          { transform: 'translateX(100%)', opacity: 0.4 },
          { transform: 'none', opacity: 1 }
        ],
        {
          duration: 380,
          easing: 'cubic-bezier(.22,1,.36,1)'
        }
      );
      return;
    }
    const animation = panel.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translateX(101%)', opacity: 0.5 }
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(.4,0,1,1)',
        fill: 'forwards'
      }
    );
    animation.onfinish = () => {
      if (this.overlays.notifications() === 'closing') this.overlays.notifications.set('closed');
    };
    this.animation = animation;
  }
}
