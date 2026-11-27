import { describe, expect, it } from 'vitest';

import { samePlace } from './maps-places';

const apple = { title: 'Apple Park', latitude: 37.3349, longitude: -122.009 };

describe('samePlace', () => {
  it('同名同坐标是同一处', () => {
    expect(samePlace(apple, { ...apple })).toBe(true);
  });

  it('坐标差在小数点后第五位以下，仍是同一处', () => {
    expect(samePlace(apple, { ...apple, latitude: 37.334904, longitude: -122.009004 })).toBe(true);
  });

  it('坐标差到小数点后第四位，就是另一处', () => {
    expect(samePlace(apple, { ...apple, latitude: 37.3351 })).toBe(false);
    expect(samePlace(apple, { ...apple, longitude: -122.0092 })).toBe(false);
  });

  it('同一坐标但标题不同，是另一处（例如落针和有名字的地点）', () => {
    expect(samePlace(apple, { ...apple, title: 'Dropped Pin' })).toBe(false);
  });
});
