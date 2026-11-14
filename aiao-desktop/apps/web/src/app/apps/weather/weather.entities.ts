import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 天气应用里的一座城市，`position` 排第一的是主城市（天气应用与小组件显示它的实况）。
 * 只存城市本身；Open-Meteo 的实时读数来自外网，不进库。
 */
@Entity({
  name: 'WeatherCity',
  tableName: 'weather_city',
  namespace: 'desktop',
  properties: [
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'latitude', type: PropertyType.number, required: true },
    { name: 'longitude', type: PropertyType.number, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class WeatherCity extends EntityBase {
  /** 显示名，例如 `Cupertino`。 */
  declare name: string;
  /** 纬度（度）。 */
  declare latitude: number;
  /** 经度（度）。 */
  declare longitude: number;
  /** 在城市列表里的次序，从 0 起。 */
  declare position: number;
}

/** 天气应用要在桌面库里登记的实体。 */
export const WEATHER_ENTITIES: readonly EntityType[] = [WeatherCity];
