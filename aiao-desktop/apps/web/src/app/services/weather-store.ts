import { I18N } from '@aiao/rxdb-i18n-angular';
import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { TemperatureUnit, isTemperatureUnit } from '../apps/weather/weather-cities';
import { WeatherCity } from '../apps/weather/weather.entities';
import { DesktopData } from '../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../data/live-query';
import { Preferences } from '../data/preferences';
import { DAYS3 } from '../shared/format';

import { ForecastPayload, parseForecast } from './weather-forecast';

/** 温度单位的偏好键。 */
const UNIT_KEY = 'weather:unit';

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

/** [英文原文, 目录 key, 图标, 夜间图标?]：天气描述的翻译入口由 {@link WeatherStore} 构造时绑定。 */
const CODES: Readonly<Record<number, readonly [string, string, string, string?]>> = {
  0: ['Clear', 'apps.weather.clear', 'g-sun', 'g-moon'],
  1: ['Mostly Clear', 'apps.weather.mostlyClear', 'g-sun', 'g-moon'],
  2: ['Partly Cloudy', 'apps.weather.partlyCloudy', 'g-suncloud', 'g-mooncloud'],
  3: ['Cloudy', 'apps.weather.cloudy', 'g-cloud'],
  45: ['Fog', 'apps.weather.fog', 'g-fog'],
  48: ['Freezing Fog', 'apps.weather.freezingFog', 'g-fog'],
  51: ['Light Drizzle', 'apps.weather.lightDrizzle', 'g-drizzle'],
  53: ['Drizzle', 'apps.weather.drizzle', 'g-drizzle'],
  55: ['Heavy Drizzle', 'apps.weather.heavyDrizzle', 'g-drizzle'],
  56: ['Freezing Drizzle', 'apps.weather.freezingDrizzle', 'g-drizzle'],
  57: ['Freezing Drizzle', 'apps.weather.freezingDrizzle', 'g-drizzle'],
  61: ['Light Rain', 'apps.weather.lightRain', 'g-rain'],
  63: ['Rain', 'apps.weather.rain', 'g-rain'],
  65: ['Heavy Rain', 'apps.weather.heavyRain', 'g-rain'],
  66: ['Freezing Rain', 'apps.weather.freezingRain', 'g-rain'],
  67: ['Freezing Rain', 'apps.weather.freezingRain', 'g-rain'],
  71: ['Light Snow', 'apps.weather.lightSnow', 'g-snow'],
  73: ['Snow', 'apps.weather.snow', 'g-snow'],
  75: ['Heavy Snow', 'apps.weather.heavySnow', 'g-snow'],
  77: ['Snow Grains', 'apps.weather.snowGrains', 'g-snow'],
  80: ['Showers', 'apps.weather.showers', 'g-rain'],
  81: ['Showers', 'apps.weather.showers', 'g-rain'],
  82: ['Heavy Showers', 'apps.weather.heavyShowers', 'g-rain'],
  85: ['Snow Showers', 'apps.weather.snowShowers', 'g-snow'],
  86: ['Snow Showers', 'apps.weather.snowShowers', 'g-snow'],
  95: ['Thunderstorms', 'apps.weather.thunderstorms', 'g-storm'],
  96: ['Thunderstorms', 'apps.weather.thunderstorms', 'g-storm'],
  99: ['Thunderstorms', 'apps.weather.thunderstorms', 'g-storm']
};

/**
 * 天气描述的翻译入口：{@link WeatherStore} 构造时绑定当前 i18n 运行时（读 locale 信号，语言切换时
 * 天气组件里的 computed 随模板重算）；未绑定时（单测没有 i18n provider）回退英文原文，行为与改动前一致。
 */
let weatherTranslate: ((key: string, english: string) => string) | undefined;

/** WMO 天气代码 → [文字, 图标]；夜里把太阳换成月亮。 */
export function weatherCode(code: number, day: boolean | number = true): readonly [string, string] {
  const entry = CODES[code];
  if (!entry) return ['—', 'g-cloud'];
  return [weatherTranslate?.(entry[1], entry[0]) ?? entry[0], !day && entry[3] ? entry[3] : entry[2]];
}

/** Open-Meteo 的预报请求地址：某个坐标的当前读数、逐小时与七天预报，温度按所选单位。 */
function forecastUrl(latitude: number, longitude: number, unit: TemperatureUnit): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    `&temperature_unit=${unit}&timezone=auto&forecast_days=7`
  );
}

interface WeatherReading {
  readonly city: string;
  readonly unit: TemperatureUnit;
  readonly payload: ForecastPayload;
  readonly receivedAt: string;
}

interface WeatherRequest {
  readonly city: string;
  readonly controller: AbortController;
  readonly promise: Promise<ForecastPayload | null>;
}

const cityKey = (city: WeatherCity | undefined): string =>
  city ? JSON.stringify([city.id, city.name, city.latitude, city.longitude]) : '';

/** 主城市的真实天气；只在本会话保留成功读数，失败有明确状态和重试入口。 */
@Service({ autoProvided: false })
export class WeatherStore {
  private readonly desktop = inject(DesktopData);
  /** 可选注入：没有偏好服务（如纯单元测试）时单位持久化静默关闭。 */
  private readonly preferences = inject(Preferences, { optional: true });
  /** 可选注入：没有 i18n 运行时（如纯单元测试）时文案回退英文原文。 */
  private readonly i18nRuntime = inject(I18N, { optional: true }) ?? undefined;
  private readonly locale = this.i18nRuntime ? toSignal(this.i18nRuntime.locale$, { requireSync: true }) : undefined;
  private readonly cities = liveQuery(
    () => WeatherCity.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    WeatherCity
  );
  private readonly city = computed(() => cityKey(this.cities().at(0)));
  private readonly forecast = signal<WeatherReading | null>(null);
  private readonly reading = computed(() => {
    const forecast = this.forecast();
    return forecast?.city === this.city() && forecast.unit === this.unit() ? forecast : null;
  });
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private pending: WeatherRequest | null = null;
  private selectedCity = '';
  private revision = 0;
  private started = false;
  private destroyed = false;
  /** 偏好恢复完成的标记：之前的单位改动不写库，避免启动时用默认值覆盖已存的选择。 */
  private persistedUnit: TemperatureUnit | null = null;
  private restoredUnit = false;

  /** 温度单位（°C/°F），切换后按新单位重新拉取，选择持久化到偏好。 */
  readonly unit = signal<TemperatureUnit>('fahrenheit');
  readonly place = computed(() => this.cities().at(0)?.name ?? '');
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly stale = computed(() => this.reading() !== null && this.error() !== null);
  readonly sourceTime = computed(() => this.reading()?.payload.current.time ?? null);
  readonly receivedAt = computed(() => this.reading()?.receivedAt ?? null);

  constructor() {
    const runtime = this.i18nRuntime;
    const locale = this.locale;
    if (runtime && locale) {
      const bound = (key: string, english: string): string => {
        locale();
        return runtime.t(key) ?? english;
      };
      weatherTranslate = bound;
      inject(DestroyRef).onDestroy(() => {
        if (weatherTranslate === bound) weatherTranslate = undefined;
      });
    }
    effect(() => {
      const city = this.city();
      if (city === this.selectedCity) return;
      untracked(() => {
        this.selectedCity = city;
        this.cancel();
        this.forecast.set(null);
        this.errorState.set(null);
        if (this.started) void this.load();
      });
    });
    /* 单位切换：作废旧读数并按新单位重新拉取。 */
    effect(() => {
      const unit = this.unit();
      if (this.reading() && this.reading()?.unit === unit) return;
      untracked(() => {
        this.cancel();
        this.forecast.set(null);
        this.errorState.set(null);
        if (this.started) void this.load();
      });
    });
    /* 启动时恢复已存的单位；之后每次切换写回偏好。 */
    this.preferences?.ready.then(
      () => {
        const saved = this.preferences?.get(UNIT_KEY, isTemperatureUnit) ?? 'fahrenheit';
        this.persistedUnit = saved;
        this.restoredUnit = true;
        if (saved !== this.unit()) this.unit.set(saved);
      },
      () => {
        this.restoredUnit = true;
      }
    );
    effect(() => {
      const unit = this.unit();
      if (!this.restoredUnit) return;
      untracked(() => {
        if (this.persistedUnit === unit) return;
        this.persistedUnit = unit;
        void this.preferences?.set(UNIT_KEY, unit).catch(() => undefined);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.cancel();
    });
  }

  /** 同城市共享正在执行的请求；已有成功读数时直接使用。 */
  load(): Promise<ForecastPayload | null> {
    return this.start(false);
  }

  /** 显式刷新失败时保留同城市旧读数，直到下一次成功。 */
  refresh(): Promise<ForecastPayload | null> {
    return this.start(true);
  }

  now(): WeatherNow | null {
    const d = this.reading()?.payload;
    if (!d) return null;
    return {
      t: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      day: d.current.is_day,
      hi: Math.round(d.daily.temperature_2m_max[0]),
      lo: Math.round(d.daily.temperature_2m_min[0]),
      live: !this.stale()
    };
  }

  /** 城市当地时间的后续预报；超出响应末尾不补造读数。 */
  hours(count = 6): readonly WeatherHour[] {
    const d = this.reading()?.payload;
    if (!d) return [];
    const start = d.hourly.time.findIndex(time => time >= d.current.time);
    if (start < 0) return [];
    return d.hourly.time.slice(start, start + Math.max(0, count)).map((time, index): WeatherHour => {
      const hour = Number(time.slice(11, 13));
      const hour12 = hour % 12 || 12;
      const mark = this.t(hour < 12 ? 'apps.weather.am' : 'apps.weather.pm', hour < 12 ? 'AM' : 'PM');
      return [
        index === 0 ?
          this.t('apps.weather.now', 'Now')
        : this.t('apps.weather.hour', `${hour12}${mark}`, { hour: hour12, mark }),
        Math.round(d.hourly.temperature_2m[start + index]),
        weatherCode(d.hourly.weather_code[start + index], hour >= 6 && hour < 20)[1]
      ];
    });
  }

  days(): readonly WeatherDay[] {
    const d = this.reading()?.payload;
    if (!d) return [];
    return d.daily.time.map((time, index): WeatherDay => [
      index === 0 ? this.t('apps.weather.today', 'Today') : DAYS3[new Date(`${time}T12:00:00Z`).getUTCDay()],
      Math.round(d.daily.temperature_2m_min[index]),
      Math.round(d.daily.temperature_2m_max[index]),
      weatherCode(d.daily.weather_code[index])[1]
    ]);
  }

  /** 给界面的文案按当前语言解析：先读 locale 信号注册依赖；未绑定运行时时回退英文原文。 */
  private t(key: string, english: string, params: Record<string, unknown> = {}): string {
    const runtime = this.i18nRuntime;
    if (!runtime || !this.locale) return english;
    this.locale();
    return runtime.t(key, params);
  }

  private start(refresh: boolean): Promise<ForecastPayload | null> {
    if (this.destroyed) return Promise.resolve(null);
    this.started = true;
    const city = this.city();
    this.selectedCity = city;
    if (this.pending?.city === city) return this.pending.promise;
    const ready = this.reading();
    if (!refresh && ready && !this.error()) return Promise.resolve(ready.payload);
    this.cancel();
    const revision = this.revision;
    const controller = new AbortController();
    this.loadingState.set(true);
    if (!ready) this.errorState.set(null);
    const promise = this.fetchForecast(controller, revision).finally(() => {
      if (revision !== this.revision) return;
      this.pending = null;
      this.loadingState.set(false);
    });
    this.pending = { city, controller, promise };
    return promise;
  }

  private cancel(): void {
    this.revision++;
    this.pending?.controller.abort();
    this.pending = null;
    this.loadingState.set(false);
  }

  private async fetchForecast(controller: AbortController, revision: number): Promise<ForecastPayload | null> {
    let failure = { key: 'error.weather.unavailable', english: 'Weather settings are unavailable.' };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const unit = this.unit();
    try {
      if (!(await this.desktop.available())) throw new Error(this.t(failure.key, failure.english));
      const repository = await this.desktop.repository(WeatherCity);
      const [city] = await repository.find({
        where: ALL_ROWS,
        orderBy: [{ field: 'position', sort: 'asc' }],
        limit: 1
      });
      failure = { key: 'error.weather.noCity', english: 'No weather city is configured.' };
      if (!city) throw new Error(this.t(failure.key, failure.english));
      if (controller.signal.aborted) return null;
      const key = cityKey(city);
      failure = { key: 'error.weather.failed', english: 'Weather is unavailable. Try again.' };
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 10_000);
      const response = await fetch(forecastUrl(city.latitude, city.longitude, unit), { signal: controller.signal });
      if (!response.ok) throw new Error(this.t(failure.key, failure.english));
      const payload = parseForecast(await response.json());
      if (revision !== this.revision || key !== this.city() || unit !== this.unit() || controller.signal.aborted)
        return null;
      this.forecast.set({ city: key, unit, payload, receivedAt: new Date().toISOString() });
      this.errorState.set(null);
      return payload;
    } catch {
      if (revision === this.revision && (!controller.signal.aborted || timedOut))
        this.errorState.set(
          timedOut ?
            this.t('error.weather.timeout', 'Weather request timed out. Try again.')
          : this.t(failure.key, failure.english)
        );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
