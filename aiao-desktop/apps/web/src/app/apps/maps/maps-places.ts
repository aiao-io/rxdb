/** 一处地点：卡片上的标题与说明，以及地图中心和缩放级别。保存收藏、回到收藏都用它。 */
export interface PlaceSpot {
  readonly title: string;
  readonly subtitle: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
}

/** 认出「同一个地方」只看标题和坐标。 */
type PlaceKey = Pick<PlaceSpot, 'title' | 'latitude' | 'longitude'>;

/** 坐标比较取小数点后几位：四位约十米，足够认出「同一个地方」。 */
const COORDINATE_DIGITS = 4;

const coordinate = (degrees: number): string => degrees.toFixed(COORDINATE_DIGITS);

/** 两处地点是不是同一个：同名，且经纬度到小数点后四位都一样。 */
export const samePlace = (a: PlaceKey, b: PlaceKey): boolean =>
  a.title === b.title &&
  coordinate(a.latitude) === coordinate(b.latitude) &&
  coordinate(a.longitude) === coordinate(b.longitude);
