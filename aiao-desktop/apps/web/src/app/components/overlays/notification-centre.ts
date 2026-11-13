import { Component, ElementRef, afterNextRender, effect, inject, viewChild } from '@angular/core';

import { AppNotification, AppNotifications } from '../../services/app-notifications';
import { Overlays } from '../../services/overlays';
import { time12Plain } from '../../shared/format';
import { Icon } from '../../shared/icon';
import {
  BatterySquareWidget,
  CalendarWidget,
  ClockSquareWidget,
  RemindersWidget,
  StocksWidget,
  WeatherWidget
} from '../widgets/widgets';

const NOTIFICATIONS = [
  ['app-messages', 'Kate', 'bringing coffee AND a blanket, i know how you drive', '4:28 PM'],
  ['app-mail', 'Figma', 'Daniel left 3 comments on Desktop v4', '4:21 PM'],
  ['app-calendar', 'Dentist', 'in 10 minutes · 3:50 PM', '3:40 PM'],
  ['app-settings', 'macOS Tahoe 26.0.1', 'A new update is available.', '1:02 PM']
] as const;

/**
 * 通知中心：小组件、应用经 `notification` 能力提交的通知（ADESK-US-206 阶段 D），再加「今天早些时候」的通知。
 * 应用通知显示来源应用的名称与图标（取自登记表，应用不能冒名）、标题、正文与时间，单条清除或全部清除，
 * 清除按钮都是原生按钮，Tab 可达；已提交的通知留在这里由用户清除，不随应用窗口关闭撤回。
 * 滑入滑出用 WAAPI 且不留 transform，否则面板的背景模糊会失效。
 */
@Component({
  selector: 'app-notification-centre',
  imports: [Icon, ClockSquareWidget, BatterySquareWidget, WeatherWidget, CalendarWidget, StocksWidget, RemindersWidget],
  styleUrl: './notification-centre.scss',
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
            <div class="nc-title" id="nc-apps-title">Notifications</div>
            <button class="nc-clear" (click)="appNotes.clearAll()" data-nc-clear-all tabindex="0" type="button">
              Clear All
            </button>
          </div>
          <ul class="nc-apps" aria-labelledby="nc-apps-title" data-nc-apps>
            @for (note of appNotes.entries(); track note.id) {
              <li
                class="note"
                [attr.data-app]="note.app.id"
                [attr.data-dedupe]="note.dedupeKey"
                [attr.data-note-id]="note.id"
                data-nc-note
              >
                <span class="art"><svg [appIcon]="note.app.icon"></svg></span>
                <span class="bd">
                  <span class="from" data-nc-app>{{ note.app.name }}</span>
                  <b data-nc-title>{{ note.title }}</b>
                  <p data-nc-body>{{ note.body }}</p>
                </span>
                @if (note.image) {
                  <img class="pic" [src]="note.image" alt="" data-nc-image />
                } @else if (note.symbol) {
                  <svg class="pic" [appIcon]="note.symbol"></svg>
                }
                <span class="tm" data-nc-time>{{ time(note) }}</span>
                <button
                  class="x"
                  [attr.aria-label]="'Clear notification from ' + note.app.name + ': ' + note.title"
                  (click)="appNotes.clear(note.id)"
                  data-nc-clear
                  tabindex="0"
                  type="button"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        }
        <div class="nc-title">Earlier Today</div>
        @for (note of notifications; track note[1]) {
          <div class="note">
            <span class="art"><svg [appIcon]="note[0]"></svg></span>
            <span class="bd"
              ><b>{{ note[1] }}</b>
              <p>{{ note[2] }}</p></span
            >
            <span class="tm">{{ note[3] }}</span>
          </div>
        }
      </div>
    </div>
  `
})
export class NotificationCentre {
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private animation: Animation | null = null;
  protected readonly overlays = inject(Overlays);
  protected readonly appNotes = inject(AppNotifications);
  protected readonly notifications = NOTIFICATIONS;

  constructor() {
    /* 首帧停在屏幕外：五个小组件的布局和模糊预热先付掉，下一帧再滑入才不掉帧。 */
    afterNextRender(() =>
      requestAnimationFrame(() => {
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
