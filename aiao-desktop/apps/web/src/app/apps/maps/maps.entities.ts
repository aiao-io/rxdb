import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 地图里收藏的一处地点，按收藏先后（`createdAt`）排列。
 * 只存地点本身（标题、说明、坐标与缩放）；地图瓦片与搜索结果来自外网，不进库。
 */
@Entity({
  name: 'MapPlace',
  tableName: 'map_place',
  namespace: 'desktop',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'subtitle', type: PropertyType.string },
    { name: 'latitude', type: PropertyType.number, required: true },
    { name: 'longitude', type: PropertyType.number, required: true },
    { name: 'zoom', type: PropertyType.integer, required: true }
  ]
})
export class MapPlace extends EntityBase {
  /** 卡片标题，例如 `Apple Park`；落针的地点叫 `Dropped Pin`。 */
  declare title: string;
  /** 卡片说明：地址，或落针处的经纬度；可以是空串。 */
  declare subtitle: string;
  /** 纬度（度）。 */
  declare latitude: number;
  /** 经度（度）。 */
  declare longitude: number;
  /** 回到这里时的缩放级别。 */
  declare zoom: number;
}

/** 地图要在桌面库里登记的实体。 */
export const MAPS_ENTITIES: readonly EntityType[] = [MapPlace];
