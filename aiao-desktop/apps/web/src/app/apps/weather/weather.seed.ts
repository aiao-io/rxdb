import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { WeatherCity } from './weather.entities';

const LEGACY_CITY = { name: 'Cupertino', latitude: 37.323, longitude: -122.0322 } as const;
const CITY_SEEDS = [{ name: 'Beijing', latitude: 39.9042, longitude: 116.4074 }] as const;
const ALL_CITIES = { combinator: 'and' as const, rules: [] };

/** 天气的初始数据：城市列表。 */
export const WEATHER_SEED: DataSeed = {
  domain: 'weather',
  version: 2,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const cities = executor.getRepository(WeatherCity);
    for (const [position, city] of CITY_SEEDS.entries()) {
      await cities.create(rxdb.entityManager.instantiate(WeatherCity, { ...city, position }));
    }
  },
  async migrate(executor: TransactionExecutor, fromVersion: number): Promise<void> {
    if (fromVersion !== 1) return;
    const cities = executor.getRepository(WeatherCity);
    const existing = await cities.find({ where: ALL_CITIES });
    for (const city of existing) {
      if (
        city.name === LEGACY_CITY.name &&
        city.latitude === LEGACY_CITY.latitude &&
        city.longitude === LEGACY_CITY.longitude
      )
        await cities.update(city, CITY_SEEDS[0]);
    }
  }
};
