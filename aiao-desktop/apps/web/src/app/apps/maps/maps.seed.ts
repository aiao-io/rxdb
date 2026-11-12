import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { CUPERTINO } from './maps-geo';
import { MapPlace } from './maps.entities';

/** 地图的初始数据：地图打开时的那处地点（苹果总部）是第一个收藏。 */
export const MAPS_SEED: DataSeed = {
  domain: 'maps',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const places = executor.getRepository(MapPlace);
    const home = {
      title: CUPERTINO.title,
      subtitle: CUPERTINO.sub,
      latitude: CUPERTINO.lat,
      longitude: CUPERTINO.lon,
      zoom: CUPERTINO.zoom
    };
    await places.create(rxdb.entityManager.instantiate(MapPlace, home));
  }
};
