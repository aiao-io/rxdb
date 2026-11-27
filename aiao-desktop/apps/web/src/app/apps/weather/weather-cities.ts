/** 天气应用可以添加的固定城市目录；坐标与 Open-Meteo 一致。 */
export const CITY_DIRECTORY = [
  { name: 'Beijing', latitude: 39.9042, longitude: 116.4074 },
  { name: 'Cupertino', latitude: 37.323, longitude: -122.0322 },
  { name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { name: 'New York', latitude: 40.7128, longitude: -74.006 },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Singapore', latitude: 1.3521, longitude: 103.8198 }
] as const;

export type CityDirectoryEntry = (typeof CITY_DIRECTORY)[number];

/** 只依赖排序用的两列。 */
export interface CityRow {
  readonly id: string;
  readonly position: number;
}

/** 提升某城为主城市：它排到 0，其余保持相对次序；本来就在第一时原样返回。 */
export const promoteCityPositions = (cities: readonly CityRow[], id: string): ReadonlyMap<string, number> => {
  const sorted = [...cities].sort((left, right) => left.position - right.position);
  const index = sorted.findIndex(city => city.id === id);
  if (index <= 0) return new Map(sorted.map((city, position) => [city.id, position]));
  const [moved] = sorted.splice(index, 1);
  sorted.unshift(moved);
  return new Map(sorted.map((city, position) => [city.id, position]));
};

/** 新城市排到列表末尾，其余位置不变。 */
export const appendCityPositions = (cities: readonly CityRow[], newId: string): ReadonlyMap<string, number> => {
  const sorted = [...cities].sort((left, right) => left.position - right.position);
  return new Map(
    sorted.map((city, position) => [city.id, position] as const).concat([[newId, sorted.length]] as const)
  );
};

/** 移除一座城市后其余重新连续编号。 */
export const removeCityPositions = (cities: readonly CityRow[], id: string): ReadonlyMap<string, number> => {
  const kept = [...cities].sort((left, right) => left.position - right.position).filter(city => city.id !== id);
  return new Map(kept.map((city, position) => [city.id, position]));
};

/** 温度单位：请求参数与显示都跟着它走。 */
export const TEMPERATURE_UNITS = ['fahrenheit', 'celsius'] as const;

export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/** 偏好里存着的单位必须在这两个里面。 */
export const isTemperatureUnit = (value: unknown): value is TemperatureUnit =>
  typeof value === 'string' && (TEMPERATURE_UNITS as readonly string[]).includes(value);
