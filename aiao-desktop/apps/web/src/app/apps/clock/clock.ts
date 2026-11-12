import { Component, computed, inject } from '@angular/core';

import { Clock } from '../../services/clock';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { AnalogClock } from '../../shared/analog-clock';
import { time12Plain } from '../../shared/format';
import { TrafficLights } from '../../shared/traffic-lights';

/** [城市, 与本机的时差（小时）] */
const ZONES = [
  ['Cupertino', -12.5],
  ['Kolkata', 0],
  ['London', -4.5],
  ['Tokyo', 3.5]
] as const;

const HOUR = 3600e3;

/** 世界时钟：四座城市的表盘与时间，随桌面时钟每秒跳动。 */
@Component({
  selector: 'app-clock',
  imports: [AnalogClock, TrafficLights],
  host: { style: 'display: contents' },
  template: `
    <div class="tb plain" data-drag>
      <div class="title">Clock</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div
      style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); min-height: 0"
    >
      @for (zone of zones(); track zone.city) {
        <div
          style="
            background: var(--win);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
          "
        >
          <div [attr.data-cw]="zone.offset" style="width: 104px; height: 104px">
            <app-analog-clock [size]="104" [time]="zone.time" />
          </div>
          <div style="font-size: 13px; font-weight: 600">{{ zone.city }}</div>
          <div [attr.data-ct]="zone.offset" style="font-size: 11.5px; color: var(--txt-2)">{{ zone.label }}</div>
        </div>
      }
    </div>
  `
})
export class ClockApp {
  private readonly clock = inject(Clock);

  protected readonly zones = computed(() =>
    ZONES.map(([city, offset]) => {
      const time = new Date(this.clock.now().getTime() + offset * HOUR);
      return { city, offset, time, label: time12Plain(time) };
    })
  );

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('clock')));
  }
}
