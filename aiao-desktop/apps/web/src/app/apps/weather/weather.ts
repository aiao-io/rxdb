import { Component, computed, inject } from '@angular/core';

import { WeatherStatus } from '../../components/weather-status';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { WeatherStore, weatherCode } from '../../services/weather-store';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

/** 天空颜色跟着昼夜走，和真机的天气应用一样。 */
const DAY_SKY = 'linear-gradient(175deg,#175e95,#154b78 55%,#113958)';
const NIGHT_SKY = 'linear-gradient(175deg,#274b7a,#1a2f52 55%,#141d33)';

interface WeekRow {
  readonly day: string;
  readonly icon: string;
  readonly lo: number;
  readonly hi: number;
  /** 温度条的左右留白（百分比，一位小数）。 */
  readonly left: string;
  readonly right: string;
}

/** 天气：主城市（城市列表里排第一的，默认库比蒂诺）的预报（Open-Meteo）；没有成功响应时不显示数字。 */
@Component({
  selector: 'app-weather',
  imports: [Icon, TrafficLights, WeatherStatus],
  host: { style: 'display: contents' },
  templateUrl: './weather.html'
})
export class WeatherApp {
  private readonly weather = inject(WeatherStore);

  protected readonly place = this.weather.place;
  /** 商店在方法内部读信号，所以实况一到，下面这些 computed 都会重算。 */
  protected readonly now = computed(() => this.weather.now());
  protected readonly label = computed(() => {
    const now = this.now();
    return now ? weatherCode(now.code, now.day)[0] : 'Weather unavailable';
  });
  protected readonly sky = computed(() => (this.now()?.day === 0 ? NIGHT_SKY : DAY_SKY));
  protected readonly hours = computed(() => this.weather.hours(6));
  /** 每根条只占那一天的温度区间在整周区间里的位置，冷天就是偏左的一小段。 */
  protected readonly week = computed((): readonly WeekRow[] => {
    const days = this.weather.days();
    const low = Math.min(...days.map(day => day[1]));
    const high = Math.max(...days.map(day => day[2]));
    const span = Math.max(1, high - low);
    return days.map(([day, lo, hi, icon]) => ({
      day,
      icon,
      lo,
      hi,
      left: (((lo - low) / span) * 100).toFixed(1),
      right: (((high - hi) / span) * 100).toFixed(1)
    }));
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('weather')));
    void this.weather.load();
  }
}
