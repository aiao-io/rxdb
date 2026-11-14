import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { WeatherCity } from './weather.entities';

/** 初始的城市列表：库比蒂诺，和原来写死的实况坐标一致。 */
const CITY_SEEDS = [{ name: 'Cupertino', latitude: 37.323, longitude: -122.0322 }] as const;

/** 天气的初始数据：城市列表。 */
export const WEATHER_SEED: DataSeed = {
  domain: 'weather',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const cities = executor.getRepository(WeatherCity);
    for (const [position, city] of CITY_SEEDS.entries()) {
      await cities.create(rxdb.entityManager.instantiate(WeatherCity, { ...city, position }));
    }
  }
};
