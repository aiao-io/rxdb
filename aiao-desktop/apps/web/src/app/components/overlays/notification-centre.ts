import { Component, ElementRef, afterNextRender, effect, inject, viewChild } from '@angular/core';

import { Overlays } from '../../services/overlays';
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
 * 通知中心：小组件加上「今天早些时候」的通知。
 * 滑入滑出用 WAAPI 且不留 transform，否则面板的背景模糊会失效。
 */
@Component({
  selector: 'app-notification-centre',
  imports: [Icon, ClockSquareWidget, BatterySquareWidget, WeatherWidget, CalendarWidget, StocksWidget, RemindersWidget],
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
