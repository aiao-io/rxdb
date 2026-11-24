import { clamp } from '../../shared/format';

/** 瓦片边长（像素）。 */
export const TILE = 256;

/** 地图打开时的位置与卡片，也是「Go to Cupertino」的去处：苹果总部。 */
export const CUPERTINO = {
  lat: 37.3349,
  lon: -122.009,
  zoom: 15,
  title: 'Apple Park',
  sub: '1 Apple Park Way · Cupertino, CA'
};

/** 经度换算成当前缩放级别下的世界像素 x（Web Mercator）。 */
export const worldX = (lon: number, z: number): number => ((lon + 180) / 360) * TILE * (1 << z);

/** 纬度换算成当前缩放级别下的世界像素 y（Web Mercator）。 */
export function worldY(lat: number, z: number): number {
  const s = Math.sin((clamp(lat, -85.05, 85.05) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * (1 << z);
}

/** 世界像素 x 反算经度。 */
export const lonAt = (x: number, z: number): number => (x / (TILE * (1 << z))) * 360 - 180;

/** 世界像素 y 反算纬度。 */
export function latAt(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * (1 << z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * CARTO 的 OSM 底图：浅色用 Voyager（蓝水、绿地、暖色陆地、白路，是最接近 Apple 地图的免费栅格样式），
 * 深色用 Dark Matter。高分屏取 @2x。
 */
export function tileUrl(x: number, y: number, z: number, dark: boolean, retina: boolean): string {
  const sub = 'abcd'[(x + y) % 4];
  const style = dark ? 'dark_all' : 'rastertiles/voyager';
  return `https://${sub}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}${retina ? '@2x' : ''}.png`;
}

/** 按结果的包围盒选缩放级别，国家不会落在街道级别。`box` 是 [南, 北, 西, 东]。 */
export function zoomForBox(box: readonly number[]): number {
  const [south, north, west, east] = box;
  /* 经纬差有浮点尾差（如 37.4-37.3 = 0.0999…），先归一到 6 位小数再比阈值，避免恰好落在档位边界时选错级。 */
  const span = Math.round(Math.max(Math.abs(north - south), Math.abs(east - west)) * 1e6) / 1e6;
  if (span >= 20) return 4;
  if (span > 8) return 6;
  if (span > 2) return 8;
  if (span > 0.5) return 11;
  if (span > 0.1) return 13;
  if (span > 0.02) return 15;
  return 16;
}

/** 方向键平移的步长（像素），一次一块瓦片的距离。 */
export const PAN_STEP = TILE;

/** 方向键 → 内容平移量（内容朝反方向动，视口跟着键走）；不认识的键为 `null`。 */
export const arrowDelta = (key: string): readonly [number, number] | null => {
  switch (key) {
    case 'ArrowLeft':
      return [PAN_STEP, 0];
    case 'ArrowRight':
      return [-PAN_STEP, 0];
    case 'ArrowUp':
      return [0, PAN_STEP];
    case 'ArrowDown':
      return [0, -PAN_STEP];
    default:
      return null;
  }
};

/** 视口里相对中心 (dx, dy) 的那一点对应的经纬度（右键落针、双击缩放共用这套换算）。 */
export const pointLatLon = (
  centerLat: number,
  centerLon: number,
  z: number,
  dx: number,
  dy: number
): { lat: number; lon: number } => ({
  lat: latAt(clamp(worldY(centerLat, z) + dy, 0, TILE * (1 << z)), z),
  lon: lonAt(worldX(centerLon, z) + dx, z)
});
