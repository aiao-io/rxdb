import { Component, computed, inject } from '@angular/core';

import { TICKERS } from '../../apps/stocks/stocks-data';
import { CalendarStore, eventTime } from '../../services/calendar-store';
import { Clock } from '../../services/clock';
import { SystemState } from '../../services/system-state';
import { WeatherStore, weatherCode } from '../../services/weather-store';
import { WindowManager } from '../../services/window-manager';
import { AnalogClock } from '../../shared/analog-clock';
import { DAYS, time12 } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Sparkline } from '../../shared/status-glyphs';

/** 今天的日程；在日历里增删、移动或隐藏事件会立刻反映到这里。 */
@Component({
  selector: 'app-calendar-widget',
  host: { class: 'wgt calw', '(dblclick)': "wm.open('calendar')" },
  template: `
    <div class="dow">{{ weekday }}</div>
    <div class="dnum">{{ today.getDate() }}</div>
    @for (event of events(); track event.id) {
      <div class="ev">
        <i [style.background]="store.colorOf(event)"></i>
        <div class="b">
          <b>{{ event.t }}</b
          ><span>{{ time(event) }}</span>
        </div>
      </div>
    } @empty {
      <div class="none">No more events today.</div>
    }
  `
})
export class CalendarWidget {
  protected readonly wm = inject(WindowManager);
  protected readonly store = inject(CalendarStore);
  protected readonly today = new Date();
  protected readonly weekday = DAYS[this.today.getDay()];
  protected readonly events = computed(() =>
    this.store.on(this.today.getFullYear(), this.today.getMonth(), this.today.getDate())
  );
  protected readonly time = eventTime;
}

/** 天气：先显示离线读数，实况到达后刷新。 */
@Component({
  selector: 'app-weather-widget',
  imports: [Icon],
  host: { class: 'wgt', '(dblclick)': "wm.open('weather')" },
  template: `
    <div class="wx" data-wxw>
      @let now = weather.now();
      @let code = condition();
      <div class="loc">{{ weather.place }}</div>
      <div class="now">
        <span class="deg">{{ now.t }}°</span><span class="ico"><svg [appIcon]="code[1]"></svg></span>
      </div>
      <div class="cond">{{ code[0] }}</div>
      <div class="hi">H:{{ now.hi }}° L:{{ now.lo }}°</div>
      <div class="hours">
        @for (hour of weather.hours(5); track $index) {
          <div>
            <span>{{ hour[0] }}</span
            ><svg [appIcon]="hour[2]"></svg><b>{{ hour[1] }}°</b>
          </div>
        }
      </div>
    </div>
  `
})
export class WeatherWidget {
  protected readonly wm = inject(WindowManager);
  protected readonly weather = inject(WeatherStore);
  protected readonly condition = computed(() => {
    const now = this.weather.now();
    return weatherCode(now.code, now.day);
  });

  constructor() {
    void this.weather.load();
  }
}

/** 前三支股票的迷你行情。 */
@Component({
  selector: 'app-stocks-widget',
  imports: [Sparkline],
  host: { class: 'wgt', '(dblclick)': "wm.open('stocks')" },
  template: `
    <div class="wh">
      <span class="t">Stocks</span><span class="s">{{ stamp }}</span>
    </div>
    <div class="stk">
      @for (ticker of tickers; track ticker.s; let i = $index) {
        <div class="row" [class.dn]="!ticker.up" [class.up]="ticker.up">
          <span class="sym"
            ><b>{{ ticker.s }}</b
            ><span>{{ ticker.n }}</span></span
          >
          <span class="spark"><app-sparkline [height]="26" [seed]="i" [up]="ticker.up" [width]="90" /></span>
          <span class="num">
            <b>{{ ticker.p.toFixed(2) }}</b
            ><span>{{ ticker.up ? '+' : '' }}{{ ticker.d.toFixed(2) }}%</span>
          </span>
        </div>
      }
    </div>
  `
})
export class StocksWidget {
  protected readonly wm = inject(WindowManager);
  protected readonly tickers = TICKERS.slice(0, 3);
  protected readonly stamp = time12(new Date());
}

/** 方形时钟小组件（通知中心）。 */
@Component({
  selector: 'app-clock-square-widget',
  imports: [AnalogClock],
  host: { class: 'wgt sqw' },
  template: `<div class="clockw" data-cl><app-analog-clock [size]="124" [time]="clock.now()" /></div>`
})
export class ClockSquareWidget {
  protected readonly clock = inject(Clock);
}

/** 方形电池小组件：环形电量与剩余时间。 */
@Component({
  selector: 'app-battery-square-widget',
  host: { class: 'wgt sqw batsq' },
  template: `
    <div class="wh"><span class="t">Battery</span></div>
    <div class="rw">
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" fill="none" r="40" stroke="var(--fill-2)" stroke-width="8" />
        <circle
          [attr.stroke-dasharray]="circumference"
          [attr.stroke-dashoffset]="circumference * (1 - system.battery() / 100)"
          [attr.stroke]="color()"
          cx="48"
          cy="48"
          fill="none"
          r="40"
          stroke-linecap="round"
          stroke-width="8"
          transform="rotate(-90 48 48)"
        />
      </svg>
      <b>{{ system.battery() }}%</b>
    </div>
    <div class="sub">{{ remaining() }}</div>
  `
})
export class BatterySquareWidget {
  protected readonly system = inject(SystemState);
  protected readonly circumference = 2 * Math.PI * 40;
  protected readonly color = computed(() =>
    !this.system.charging() && this.system.battery() <= 20 ? '#ff9f0a' : '#30d158'
  );
  protected readonly remaining = computed(() => {
    if (this.system.charging()) return 'Charging';
    const mins = Math.round((this.system.battery() / 100) * 11.4 * 60);
    return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
  });
}

/** 今天的提醒事项。 */
@Component({
  selector: 'app-reminders-widget',
  host: { class: 'wgt', '(dblclick)': "wm.open('reminders')" },
  template: `
    <div class="wh"><span class="t">Today</span><span class="s">3 remaining</span></div>
    @for (item of items; track item[0]) {
      <div style="display: flex; gap: 9px; align-items: center; padding: 5px 0; border-top: 0.5px solid var(--line)">
        <span
          [style.border]="'1.6px solid ' + item[1]"
          style="width: 15px; height: 15px; border-radius: 50%; flex: none"
        ></span>
        <span style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{
          item[0]
        }}</span>
      </div>
    }
  `
})
export class RemindersWidget {
  protected readonly wm = inject(WindowManager);
  protected readonly items = [
    ['Send brand review feedback', '#ff375f'],
    ['Review PR #142', '#0a84ff'],
    ['Pick up dry cleaning', '#ff9f0a']
  ] as const;
}
