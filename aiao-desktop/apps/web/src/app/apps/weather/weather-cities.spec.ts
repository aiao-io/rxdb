import { describe, expect, it } from 'vitest';

import {
  CITY_DIRECTORY,
  appendCityPositions,
  isTemperatureUnit,
  promoteCityPositions,
  removeCityPositions
} from './weather-cities';

const cities = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 }
];

describe('promoteCityPositions', () => {
  it('提升的城市排到 0，其余保持相对次序', () => {
    expect(Object.fromEntries(promoteCityPositions(cities, 'c'))).toEqual({ a: 1, b: 2, c: 0 });
    expect(Object.fromEntries(promoteCityPositions(cities, 'b'))).toEqual({ a: 1, b: 0, c: 2 });
  });

  it('本来就在第一的城市原样返回', () => {
    expect(Object.fromEntries(promoteCityPositions(cities, 'a'))).toEqual({ a: 0, b: 1, c: 2 });
  });
});

describe('appendCityPositions / removeCityPositions', () => {
  it('新城市排到末尾', () => {
    expect(Object.fromEntries(appendCityPositions(cities, 'd'))).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });

  it('移除后其余重新连续编号', () => {
    expect(Object.fromEntries(removeCityPositions(cities, 'b'))).toEqual({ a: 0, c: 1 });
  });
});

describe('CITY_DIRECTORY', () => {
  it('目录里没有重复城市名，坐标都在合法范围内', () => {
    const names = CITY_DIRECTORY.map(city => city.name);
    expect(new Set(names).size).toBe(names.length);
    for (const city of CITY_DIRECTORY) {
      expect(Math.abs(city.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.longitude)).toBeLessThanOrEqual(180);
    }
  });
});

describe('isTemperatureUnit', () => {
  it('只认华氏度与摄氏度', () => {
    expect(isTemperatureUnit('fahrenheit')).toBe(true);
    expect(isTemperatureUnit('celsius')).toBe(true);
    expect(isTemperatureUnit('kelvin')).toBe(false);
    expect(isTemperatureUnit(1)).toBe(false);
    expect(isTemperatureUnit(null)).toBe(false);
  });
});
