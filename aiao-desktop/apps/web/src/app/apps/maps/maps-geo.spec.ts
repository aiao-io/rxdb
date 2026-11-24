import { describe, expect, it } from 'vitest';

import { CUPERTINO, PAN_STEP, TILE, arrowDelta, latAt, lonAt, pointLatLon, worldX, worldY, zoomForBox } from './maps-geo';

describe('arrowDelta', () => {
  it('四个方向键各平移一块瓦片的距离', () => {
    expect(arrowDelta('ArrowLeft')).toEqual([PAN_STEP, 0]);
    expect(arrowDelta('ArrowRight')).toEqual([-PAN_STEP, 0]);
    expect(arrowDelta('ArrowUp')).toEqual([0, PAN_STEP]);
    expect(arrowDelta('ArrowDown')).toEqual([0, -PAN_STEP]);
    expect(PAN_STEP).toBe(TILE);
  });

  it('其他键返回 null', () => {
    expect(arrowDelta('a')).toBeNull();
    expect(arrowDelta('Enter')).toBeNull();
  });
});

describe('pointLatLon', () => {
  it('中心点就是地图中心', () => {
    const point = pointLatLon(CUPERTINO.lat, CUPERTINO.lon, CUPERTINO.zoom, 0, 0);
    expect(point.lat).toBeCloseTo(CUPERTINO.lat, 6);
    expect(point.lon).toBeCloseTo(CUPERTINO.lon, 6);
  });

  it('偏移换算可逆：算出来的点再换算回同一世界坐标', () => {
    const dx = 137;
    const dy = -95;
    const point = pointLatLon(CUPERTINO.lat, CUPERTINO.lon, CUPERTINO.zoom, dx, dy);
    expect(worldX(point.lon, CUPERTINO.zoom) - worldX(CUPERTINO.lon, CUPERTINO.zoom)).toBeCloseTo(dx, 6);
    expect(worldY(point.lat, CUPERTINO.zoom) - worldY(CUPERTINO.lat, CUPERTINO.zoom)).toBeCloseTo(dy, 6);
  });
});

describe('zoomForBox / 投影往返', () => {
  it('包围盒越大缩放越小', () => {
    expect(zoomForBox([30, 50, -10, 10])).toBe(4);
    expect(zoomForBox([37.3, 37.4, -122.1, -122])).toBe(15);
  });

  it('世界像素与经纬度互逆', () => {
    expect(lonAt(worldX(CUPERTINO.lon, 12), 12)).toBeCloseTo(CUPERTINO.lon, 9);
    expect(latAt(worldY(CUPERTINO.lat, 12), 12)).toBeCloseTo(CUPERTINO.lat, 9);
  });
});
