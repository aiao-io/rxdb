import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject } from '@angular/core';

import { WeatherStatus } from '../../components/weather-status';
import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { WeatherStore, weatherCode } from '../../services/weather-store';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  CITY_DIRECTORY,
  CityDirectoryEntry,
  TEMPERATURE_UNITS,
  promoteCityPositions,
  removeCityPositions,
  type TemperatureUnit
} from './weather-cities';
import { WeatherCity } from './weather.entities';

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

/** 天气：主城市（城市列表里排第一的）的预报（Open-Meteo）；侧栏管理城市与 °C/°F。 */
@Component({
  selector: 'app-weather',
  imports: [Icon, TrafficLights, WeatherStatus],
  host: { style: 'display: contents' },
  templateUrl: './weather.html'
})
export class WeatherApp {
  private readonly weather = inject(WeatherStore);
  private readonly data = inject(DesktopData);
  private readonly popover = inject(PopoverService);
  private readonly cities = liveQuery(
    () => WeatherCity.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    WeatherCity
  );

  protected readonly i18n = useI18n();

  protected readonly place = this.weather.place;
  protected readonly unit = this.weather.unit;
  /** 单位切换按钮的两个选项（模板 @for 用，保持字面量联合类型）。 */
  protected readonly temperatureUnits = TEMPERATURE_UNITS;
  /** 城市列表（排第一的是主城市）。 */
  protected readonly cityRows = computed(() => this.cities());
  /** 可添加目录里还没有的城市。 */
  protected readonly addable = computed<readonly CityDirectoryEntry[]>(() => {
    const present = new Set(this.cities().map(city => city.name));
    return CITY_DIRECTORY.filter(city => !present.has(city.name));
  });
  /** 商店在方法内部读信号，所以实况一到，下面这些 computed 都会重算。 */
  protected readonly now = computed(() => this.weather.now());
  protected readonly label = computed(() => {
    const now = this.now();
    return now ? weatherCode(now.code, now.day)[0] : this.i18n.t('apps.weather.unavailable');
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

  /** 点城市列表：把它提升为主城市（排到第一），重新拉取实况。 */
  protected makePrimary(city: WeatherCity): void {
    void this.data.transaction(async executor => {
      const repository = executor.getRepository(WeatherCity);
      const fresh = await repository.find({ where: ALL_ROWS });
      const positions = promoteCityPositions(fresh, city.id);
      for (const row of fresh) {
        const position = positions.get(row.id);
        if (position !== undefined && position !== row.position) await repository.update(row, { position });
      }
    });
  }

  protected removeCity(city: WeatherCity): void {
    void this.data.transaction(async executor => {
      const repository = executor.getRepository(WeatherCity);
      const fresh = await repository.find({ where: ALL_ROWS });
      const positions = removeCityPositions(fresh, city.id);
      for (const row of fresh) {
        const position = positions.get(row.id);
        if (position !== undefined && position !== row.position) await repository.update(row, { position });
      }
      await repository.remove(city);
    });
  }

  /** 「+」打开固定城市目录，点一个添加并切过去。 */
  protected openAdd(event: Event): void {
    const anchor = event.currentTarget as HTMLElement;
    const addable = this.addable();
    this.popover.menuUnder(
      anchor,
      addable.length ?
        addable.map(city => ({
          id: city.name,
          label: city.name,
          run: () => void this.addCity(city)
        }))
      : [{ id: 'none', label: this.i18n.t('apps.weather.allCitiesAdded'), disabled: true }],
      { label: this.i18n.t('apps.weather.addCity'), keyboard: true }
    );
  }

  protected setUnit(unit: TemperatureUnit): void {
    this.weather.unit.set(unit);
  }

  private async addCity(city: CityDirectoryEntry): Promise<void> {
    const row = this.data.instantiate(WeatherCity, { ...city, position: 0 });
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(WeatherCity);
      await repository.create(row);
      const fresh = await repository.find({ where: ALL_ROWS });
      const positions = promoteCityPositions(fresh, row.id);
      for (const entry of fresh) {
        const position = positions.get(entry.id);
        if (position !== undefined && position !== entry.position) await repository.update(entry, { position });
      }
    });
  }
}
