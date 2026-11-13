import { Service, computed, inject, signal } from '@angular/core';

import { WeatherCity } from '../apps/weather/weather.entities';
import { DesktopData } from '../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../data/live-query';
import { DAYS3 } from '../shared/format';

interface ForecastPayload {
  readonly current: {
    readonly time: string;
    readonly temperature_2m: number;
    readonly weather_code: number;
    readonly is_day: number;
  };
  readonly hourly: {
    readonly time: readonly string[];
    readonly temperature_2m: readonly number[];
    readonly weather_code: readonly number[];
  };
  readonly daily: {
    readonly time: readonly string[];
    readonly weather_code: readonly number[];
    readonly temperature_2m_max: readonly number[];
    readonly temperature_2m_min: readonly number[];
  };
}

export interface WeatherNow {
  readonly t: number;
  readonly code: number;
  readonly day: number;
  readonly hi: number;
  readonly lo: number;
  readonly live: boolean;
}

/** [时刻标签, 温度, 图标] */
export type WeatherHour = readonly [string, number, string];
/** [星期, 最低, 最高, 图标] */
export type WeatherDay = readonly [string, number, number, string];

const CODES: Readonly<Record<number, readonly [string, string, string?]>> = {
  0: ['Clear', 'g-sun', 'g-moon'],
  1: ['Mostly Clear', 'g-sun', 'g-moon'],
  2: ['Partly Cloudy', 'g-suncloud', 'g-mooncloud'],
  3: ['Cloudy', 'g-cloud'],
  45: ['Fog', 'g-fog'],
  48: ['Freezing Fog', 'g-fog'],
  51: ['Light Drizzle', 'g-drizzle'],
  53: ['Drizzle', 'g-drizzle'],
  55: ['Heavy Drizzle', 'g-drizzle'],
  56: ['Freezing Drizzle', 'g-drizzle'],
  57: ['Freezing Drizzle', 'g-drizzle'],
  61: ['Light Rain', 'g-rain'],
  63: ['Rain', 'g-rain'],
  65: ['Heavy Rain', 'g-rain'],
  66: ['Freezing Rain', 'g-rain'],
  67: ['Freezing Rain', 'g-rain'],
  71: ['Light Snow', 'g-snow'],
  73: ['Snow', 'g-snow'],
  75: ['Heavy Snow', 'g-snow'],
  77: ['Snow Grains', 'g-snow'],
  80: ['Showers', 'g-rain'],
  81: ['Showers', 'g-rain'],
  82: ['Heavy Showers', 'g-rain'],
  85: ['Snow Showers', 'g-snow'],
  86: ['Snow Showers', 'g-snow'],
  95: ['Thunderstorms', 'g-storm'],
  96: ['Thunderstorms', 'g-storm'],
  99: ['Thunderstorms', 'g-storm']
};

const OFFLINE_HOURS: readonly WeatherHour[] = [
  ['Now', 55, 'g-sun'],
  ['5PM', 56, 'g-sun'],
  ['6PM', 54, 'g-suncloud'],
  ['7PM', 51, 'g-mooncloud'],
  ['8PM', 49, 'g-moon'],
  ['9PM', 47, 'g-moon']
];

const OFFLINE_DAYS: readonly WeatherDay[] = [
  ['Today', 53, 83, 'g-sun'],
  ['Tue', 55, 81, 'g-sun'],
  ['Wed', 56, 84, 'g-suncloud'],
  ['Thu', 57, 88, 'g-sun'],
  ['Fri', 56, 85, 'g-sun'],
  ['Sat', 54, 79, 'g-suncloud'],
  ['Sun', 52, 76, 'g-sun']
];

/** WMO 天气代码 → [文字, 图标]；夜里把太阳换成月亮。 */
export function weatherCode(code: number, day: boolean | number = true): readonly [string, string] {
  const entry = CODES[code];
  if (!entry) return ['—', 'g-cloud'];
  return [entry[0], !day && entry[2] ? entry[2] : entry[1]];
}

/** Open-Meteo 的预报请求地址：某个坐标的当前读数、逐小时与七天预报（华氏度）。 */
function forecastUrl(latitude: number, longitude: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&temperature_unit=fahrenheit&timezone=auto&forecast_days=7'
  );
}

/**
 * Open-Meteo 实况：无需密钥且带 CORS，天气应用与小组件共用一份读数。
 * 城市来自本地库的城市列表（排第一的是主城市），实时读数只放内存。
 * 离线时返回一组合理的固定读数，界面不会空着。
 */
@Service({ autoProvided: false })
export class WeatherStore {
  private readonly desktop = inject(DesktopData);
  private readonly cities = liveQuery(
    () => WeatherCity.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  private readonly forecast = signal<ForecastPayload | null>(null);
  private pending: Promise<ForecastPayload | null> | null = null;

  /** 主城市的名字；城市列表还没读到时为空串。 */
  readonly place = computed(() => this.cities().at(0)?.name ?? '');

  /** 每个会话只请求一次，所有调用方共享；失败后下一次调用会重试。 */
  load(): Promise<ForecastPayload | null> {
    const ready = this.forecast();
    if (ready) return Promise.resolve(ready);
    this.pending ??= this.fetchForecast().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  now(): WeatherNow {
    const d = this.forecast();
    if (!d) return { t: 55, code: 0, day: 1, hi: 83, lo: 53, live: false };
    return {
      t: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      day: d.current.is_day,
      hi: Math.round(d.daily.temperature_2m_max[0]),
      lo: Math.round(d.daily.temperature_2m_min[0]),
      live: true
    };
  }

  /** 接下来几个小时；Open-Meteo 从午夜开始返回，所以先找到当前小时。 */
  hours(count = 6): readonly WeatherHour[] {
    const d = this.forecast();
    if (!d) return OFFLINE_HOURS.slice(0, count);
    const now = new Date(d.current.time);
    const start = Math.max(
      0,
      d.hourly.time.findIndex(time => new Date(time) >= now)
    );
    return Array.from({ length: count }, (_, k): WeatherHour => {
      const j = Math.min(start + k, d.hourly.time.length - 1);
      const hour = new Date(d.hourly.time[j]).getHours();
      return [
        k === 0 ? 'Now' : `${hour % 12 || 12}${hour < 12 ? 'AM' : 'PM'}`,
        Math.round(d.hourly.temperature_2m[j]),
        weatherCode(d.hourly.weather_code[j], hour >= 6 && hour < 20)[1]
      ];
    });
  }

  days(): readonly WeatherDay[] {
    const d = this.forecast();
    if (!d) return OFFLINE_DAYS;
    return d.daily.time.map((time, i): WeatherDay => [
      i === 0 ? 'Today' : DAYS3[new Date(`${time}T12:00`).getDay()],
      Math.round(d.daily.temperature_2m_min[i]),
      Math.round(d.daily.temperature_2m_max[i]),
      weatherCode(d.daily.weather_code[i])[1]
    ]);
  }

  /** 从库里取主城市的坐标再请求实况；没有城市就没有实况可取。 */
  private async fetchForecast(): Promise<ForecastPayload | null> {
    if (!(await this.desktop.available())) return null;
    const cities = await this.desktop.repository(WeatherCity);
    const [city] = await cities.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
    return city ? this.request(city.latitude, city.longitude) : null;
  }

  /** 网络不通或返回异常时得到 `null`，界面退回离线读数。 */
  private async request(latitude: number, longitude: number): Promise<ForecastPayload | null> {
    try {
      const response = await fetch(forecastUrl(latitude, longitude));
      const payload = (await response.json()) as ForecastPayload;
      if (!payload.current) throw new Error('bad payload');
      this.forecast.set(payload);
      return payload;
    } catch {
      return null;
    }
  }
}
