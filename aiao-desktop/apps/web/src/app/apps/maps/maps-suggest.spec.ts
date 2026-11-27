import { describe, expect, it } from 'vitest';

import { PlaceSpot } from './maps-places';
import { MAX_RECENT_PLACES, isPlaceSpotList, recordRecent, suggestRecent } from './maps-suggest';

const spot = (title: string, latitude = 37.3349, longitude = -122.009): PlaceSpot => ({
  title,
  subtitle: `${title} address`,
  latitude,
  longitude,
  zoom: 15
});

const RECENT: readonly PlaceSpot[] = [spot('Apple Park'), spot('Ferry Building', 37.7955, -122.3937)];

describe('suggestRecent', () => {
  it('按标题与说明匹配，忽略大小写', () => {
    expect(suggestRecent(RECENT, 'apple').map(item => item.title)).toEqual(['Apple Park']);
    expect(suggestRecent(RECENT, 'FERRY').map(item => item.title)).toEqual(['Ferry Building']);
  });

  it('查询为空返回空列表', () => {
    expect(suggestRecent(RECENT, '  ')).toEqual([]);
  });
});

describe('recordRecent', () => {
  it('同地点去重并移到最前', () => {
    expect(recordRecent(RECENT, spot('Apple Park')).map(item => item.title)).toEqual(['Apple Park', 'Ferry Building']);
  });

  it('超过上限丢最旧的', () => {
    let recent: readonly PlaceSpot[] = [];
    for (let index = 0; index < MAX_RECENT_PLACES + 3; index++) recent = recordRecent(recent, spot(`P${index}`));
    expect(recent.length).toBe(MAX_RECENT_PLACES);
    expect(recent[0].title).toBe('P12');
  });
});

describe('isPlaceSpotList', () => {
  it('逐项校验地点字段', () => {
    expect(isPlaceSpotList(RECENT)).toBe(true);
    expect(isPlaceSpotList([{ ...spot('X'), latitude: 'bad' }])).toBe(false);
    expect(isPlaceSpotList('no')).toBe(false);
  });
});
