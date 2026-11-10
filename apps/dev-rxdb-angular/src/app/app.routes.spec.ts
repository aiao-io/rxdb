import { DefaultUrlSerializer, UrlSegment, UrlSegmentGroup } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { appRoutes } from './app.routes';

const serializer = new DefaultUrlSerializer();

/** 与路由器同一条解析链：URL → 已解码的 UrlSegment。 */
const segmentsOf = (url: string): UrlSegment[] => serializer.parse(url).root.children['primary']?.segments ?? [];

/** 跑一遍路由表里的 matcher，取出页面拿到的路径参数。 */
const matchedPath = (url: string, param: 'opfsPath' | 'storagePath'): string | undefined => {
  const segments = segmentsOf(url);
  const group = new UrlSegmentGroup(segments, {});
  for (const route of appRoutes) {
    const value = route.matcher?.(segments, group, route)?.posParams?.[param]?.path;
    if (value !== undefined) return value;
  }
  return undefined;
};

describe('opfs / storage 路由的路径参数', () => {
  // 页面按段 encodeURIComponent 拼 URL，路由器解析时已解码一次，matcher 不能再解一次
  const cases: Array<[string, string]> = [
    ['', '/'],
    ['/100%25', '/100%/'],
    ['/literal%252Fname', '/literal%2Fname/'],
    ['/%E4%B8%AD%E6%96%87/a%20b', '/中文/a b/']
  ];

  it.each(cases)('/opfs%s → %s', (suffix, expected) => {
    expect(matchedPath(`/opfs${suffix}`, 'opfsPath')).toBe(expected);
  });

  it.each(cases)('/storage%s → %s', (suffix, expected) => {
    expect(matchedPath(`/storage${suffix}`, 'storagePath')).toBe(expected);
  });
});
