import { Component, computed, inject } from '@angular/core';

import { toTicker } from '../../apps/stocks/stocks-data';
import { WatchlistSymbol } from '../../apps/stocks/stocks.entities';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { CalendarStore, eventTime } from '../../services/calendar-store';
import { WeatherStore, weatherCode } from '../../services/weather-store';
import { WindowManager } from '../../services/window-manager';
import { DAYS, time12 } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Sparkline } from '../../shared/status-glyphs';
import { WeatherStatus } from '../weather-status';

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
          <b>{{ event.t }}</b><span>{{ time(event) }}</span>
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

/** 天气：只展示真实响应，失败与旧读数状态和天气应用同步。 */
@Component({
  selector: 'app-weather-widget',
  imports: [Icon, WeatherStatus],
  host: { class: 'wgt', '(dblclick)': "wm.open('weather')" },
  template: `
    <div class="wx" data-wxw>
      <div class="loc">{{ weather.place() }}</div>
      @if (weather.now(); as now) {
        @let code = condition();
        <div class="now">
          <span class="deg">{{ now.t }}°</span><span class="ico"><svg [appIcon]="code[1]"></svg></span>
        </div>
        <div class="cond">{{ code[0] }}</div>
        <div class="hi">H:{{ now.hi }}° L:{{ now.lo }}°</div>
        <div class="hours">
          @for (hour of weather.hours(5); track $index) {
            <div>
              <span>{{ hour[0] }}</span><svg [appIcon]="hour[2]"></svg><b>{{ hour[1] }}°</b>
            </div>
          }
        </div>
      } @else {
        <p>No weather data</p>
      }
      <app-weather-status />
    </div>
  `
})
export class WeatherWidget {
  protected readonly wm = inject(WindowManager);
  protected readonly weather = inject(WeatherStore);
  protected readonly condition = computed(() => {
    const now = this.weather.now();
    return now ? weatherCode(now.code, now.day) : ['Weather unavailable', 'g-cloud'];
  });

  constructor() {
    void this.weather.load();
  }
}

/** 自选列表前三支股票的迷你行情。 */
@Component({
  selector: 'app-stocks-widget',
  imports: [Sparkline],
  host: { class: 'wgt', '(dblclick)': "wm.open('stocks')" },
  template: `
    <div class="wh">
      <span class="t">Stocks</span><span class="s">{{ stamp }}</span>
    </div>
    <div class="stk">
      @for (ticker of tickers(); track ticker.s; let i = $index) {
        <div class="row" [class.dn]="!ticker.up" [class.up]="ticker.up">
          <span class="sym"
            ><b>{{ ticker.s }}</b
            ><span>{{ ticker.n }}</span></span
          >
          <span class="spark"><app-sparkline [height]="26" [seed]="i" [up]="ticker.up" [width]="90" /></span>
          <span class="num">
            <b>{{ ticker.p.toFixed(2) }}</b><span>{{ ticker.up ? '+' : '' }}{{ ticker.d.toFixed(2) }}%</span>
          </span>
        </div>
      }
    </div>
  `
})
export class StocksWidget {
  private readonly watchlist = liveQuery(
    () => WatchlistSymbol.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 3 }),
    [],
    WatchlistSymbol
  );

  protected readonly wm = inject(WindowManager);
  protected readonly tickers = computed(() => this.watchlist().map(toTicker));
  protected readonly stamp = time12(new Date());
}
