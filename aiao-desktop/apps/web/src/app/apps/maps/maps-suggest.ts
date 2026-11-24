import { PlaceSpot, samePlace } from './maps-places';

/** 最近地点最多记几个。 */
export const MAX_RECENT_PLACES = 10;

/** 最近地点里按标题与说明匹配查询的条目；查询为空返回空（不弹整张历史）。 */
export const suggestRecent = (recent: readonly PlaceSpot[], query: string): readonly PlaceSpot[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return recent.filter(spot => `${spot.title} ${spot.subtitle}`.toLocaleLowerCase().includes(normalized));
};

/** 记一次最近使用：同地点去重后移到最前，超过上限丢最旧的。 */
export const recordRecent = (recent: readonly PlaceSpot[], spot: PlaceSpot): readonly PlaceSpot[] => {
  const kept = recent.filter(item => !samePlace(item, spot));
  return [spot, ...kept].slice(0, MAX_RECENT_PLACES);
};

/** 偏好里存着的最近地点列表要逐项校验。 */
export const isPlaceSpotList = (value: unknown): value is readonly PlaceSpot[] => {
  if (!Array.isArray(value)) return false;
  return value.every(
    item =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PlaceSpot).title === 'string' &&
      typeof (item as PlaceSpot).subtitle === 'string' &&
      typeof (item as PlaceSpot).latitude === 'number' &&
      Number.isFinite((item as PlaceSpot).latitude) &&
      typeof (item as PlaceSpot).longitude === 'number' &&
      Number.isFinite((item as PlaceSpot).longitude) &&
      typeof (item as PlaceSpot).zoom === 'number' &&
      Number.isFinite((item as PlaceSpot).zoom)
  );
};
