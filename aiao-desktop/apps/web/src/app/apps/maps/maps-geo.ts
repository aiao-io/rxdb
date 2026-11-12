import { clamp } from '../../shared/format';

/** 瓦片边长（像素）。 */
export const TILE = 256;

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
  const span = Math.max(Math.abs(north - south), Math.abs(east - west));
  if (span > 20) return 4;
  if (span > 8) return 6;
  if (span > 2) return 8;
  if (span > 0.5) return 11;
  if (span > 0.1) return 13;
  if (span > 0.02) return 15;
  return 16;
}
